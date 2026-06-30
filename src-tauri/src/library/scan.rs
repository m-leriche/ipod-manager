use crate::audio_utils::collect_audio_files;
use rusqlite::{params, Connection};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Emitter};
use unicode_normalization::UnicodeNormalization;

use super::folders::get_folders;
use super::now_epoch;
use super::track_io::{read_track_for_library, upsert_track};
use super::types::LibraryScanProgress;

pub fn scan_folder(
    conn: &super::SharedConn,
    folder_path: &str,
    app: &AppHandle,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<usize, String> {
    let root = Path::new(folder_path);
    if !root.exists() {
        return Err(format!("Path does not exist: {}", folder_path));
    }

    let mut audio_files = Vec::new();
    collect_audio_files(root, &mut audio_files);

    let total = audio_files.len();
    let now = now_epoch();
    let mut scanned = 0;

    for (i, file_path) in audio_files.iter().enumerate() {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err("Cancelled".to_string());
        }

        let file_name = file_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let _ = app.emit(
            "library-scan-progress",
            LibraryScanProgress {
                total,
                completed: i,
                current_file: file_name,
            },
        );

        // `scanned` counts every file seen, whether or not it needed rewriting.
        upsert_if_changed(conn, file_path, now)?;
        scanned += 1;
    }

    // Remove tracks whose files no longer exist on disk for this folder.
    let db_paths = paths_under_folder(conn, folder_path)?;
    let orphans: Vec<&String> = db_paths.iter().filter(|p| !Path::new(p).exists()).collect();
    delete_paths(conn, &orphans)?;

    Ok(scanned)
}

pub fn rescan_all_folders(
    conn: &super::SharedConn,
    app: &AppHandle,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<(), String> {
    let folders = {
        let c = super::lock_shared(conn)?;
        get_folders(&c)?
    };

    let all_files = collect_folder_files(&folders);
    let total = all_files.len();
    let now = now_epoch();

    for (i, (file_path, _folder_path)) in all_files.iter().enumerate() {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err("Cancelled".to_string());
        }

        let file_name = file_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let _ = app.emit(
            "library-scan-progress",
            LibraryScanProgress {
                total,
                completed: i,
                current_file: file_name,
            },
        );

        upsert_if_changed(conn, file_path, now)?;
    }

    for folder in &folders {
        remove_ghosts(conn, &folder.path)?;
    }

    let _ = app.emit(
        "library-scan-progress",
        LibraryScanProgress {
            total,
            completed: total,
            current_file: String::new(),
        },
    );

    Ok(())
}

/// Silent background rescan — no per-file progress events, returns change counts.
/// Used for incremental re-scan on app launch after loading cached data.
pub fn background_rescan_all_folders(
    conn: &super::SharedConn,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<super::types::BackgroundScanResult, String> {
    let folders = {
        let c = super::lock_shared(conn)?;
        get_folders(&c)?
    };

    let all_files = collect_folder_files(&folders);
    let total = all_files.len();
    let now = now_epoch();
    let mut changed = 0;

    for (file_path, _folder_path) in &all_files {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err("Cancelled".to_string());
        }

        if upsert_if_changed(conn, file_path, now)? {
            changed += 1;
        }
    }

    let mut removed = {
        let c = super::lock_shared(conn)?;
        remove_non_nfc_duplicates(&c)?
    };

    // Remove orphaned tracks (files deleted from disk)
    for folder in &folders {
        if !Path::new(&folder.path).exists() {
            continue;
        }
        removed += remove_ghosts(conn, &folder.path)?;
    }

    // Persist the scan timestamp so we know when the last successful scan ran
    {
        let c = super::lock_shared(conn)?;
        let _ = super::settings::set_setting(&c, "last_scan_timestamp", &now.to_string());
    }

    Ok(super::types::BackgroundScanResult {
        changed,
        removed,
        total_scanned: total,
    })
}

// ── Per-file helpers ───────────────────────────────────────────
//
// These keep the DB lock short: it is held only for the mtime lookup and the
// upsert, never across the slow tag read in `read_track_for_library`.

fn file_mtime(path: &Path) -> i64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Read a track's tags and upsert it, but only if its mtime differs from the
/// stored value. Returns `true` when the track was (re)written.
fn upsert_if_changed(conn: &super::SharedConn, file_path: &Path, now: i64) -> Result<bool, String> {
    let file_path_str = file_path.to_string_lossy().to_string();
    let mtime = file_mtime(file_path);

    let existing_mtime: Option<i64> = {
        let c = super::lock_shared(conn)?;
        c.query_row(
            "SELECT modified_at FROM tracks WHERE file_path = ?1",
            params![file_path_str],
            |row| row.get(0),
        )
        .ok()
    };

    if existing_mtime == Some(mtime) {
        return Ok(false);
    }

    // Slow tag read runs without the DB lock held.
    let track_data = read_track_for_library(file_path);
    let c = super::lock_shared(conn)?;
    upsert_track(&c, &track_data, mtime, now)?;
    Ok(true)
}

fn collect_folder_files(folders: &[super::types::LibraryFolder]) -> Vec<(PathBuf, String)> {
    let mut all_files: Vec<(PathBuf, String)> = Vec::new();
    for folder in folders {
        let root = Path::new(&folder.path);
        if !root.exists() {
            continue; // External drive may be disconnected — skip silently
        }
        let mut folder_files = Vec::new();
        collect_audio_files(root, &mut folder_files);
        for f in folder_files {
            all_files.push((f, folder.path.clone()));
        }
    }
    all_files
}

// ── Orphan-deletion helpers ────────────────────────────────────

fn paths_under_folder(conn: &super::SharedConn, folder_path: &str) -> Result<Vec<String>, String> {
    let c = super::lock_shared(conn)?;
    let mut stmt = c
        .prepare("SELECT file_path FROM tracks WHERE file_path LIKE ?1")
        .map_err(|e| format!("Query failed: {}", e))?;
    let paths = stmt
        .query_map(params![format!("{}%", folder_path)], |row| row.get(0))
        .map_err(|e| format!("Query failed: {}", e))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(paths)
}

fn delete_paths(conn: &super::SharedConn, paths: &[&String]) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }
    let c = super::lock_shared(conn)?;
    for db_path in paths {
        c.execute("DELETE FROM tracks WHERE file_path = ?1", params![db_path])
            .ok();
    }
    Ok(())
}

/// Delete rows under `folder_path` whose paths are "ghosts" (missing file, or a
/// case/normalization duplicate). Returns the number of rows removed.
fn remove_ghosts(conn: &super::SharedConn, folder_path: &str) -> Result<usize, String> {
    let db_paths = paths_under_folder(conn, folder_path)?;
    let mut removed = 0;
    let c = super::lock_shared(conn)?;
    for db_path in &db_paths {
        if super::is_ghost_path(db_path, &c) {
            c.execute("DELETE FROM tracks WHERE file_path = ?1", params![db_path])
                .ok();
            removed += 1;
        }
    }
    Ok(removed)
}

/// Remove non-NFC duplicate entries left over from before path normalization.
/// If both NFC and NFD versions of a path exist, delete the non-NFC one.
/// Returns the number of entries removed.
pub(super) fn remove_non_nfc_duplicates(conn: &Connection) -> Result<usize, String> {
    let mut stmt = conn
        .prepare("SELECT id, file_path FROM tracks")
        .map_err(|e| format!("Query failed: {}", e))?;
    let all_entries: Vec<(i64, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| format!("Query failed: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let mut removed = 0;
    for (id, path) in &all_entries {
        let nfc: String = path.nfc().collect();
        if *path != nfc {
            // This entry has a non-NFC path — check if the NFC version exists
            let nfc_exists: bool = conn
                .query_row(
                    "SELECT 1 FROM tracks WHERE file_path = ?1",
                    params![nfc],
                    |_| Ok(true),
                )
                .unwrap_or(false);
            if nfc_exists {
                conn.execute("DELETE FROM tracks WHERE id = ?1", params![id])
                    .ok();
                removed += 1;
            }
        }
    }
    Ok(removed)
}
