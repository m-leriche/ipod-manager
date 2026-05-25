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
    conn: &Connection,
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

        let file_path_str = file_path.to_string_lossy().to_string();
        let mtime = fs::metadata(file_path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let existing_mtime: Option<i64> = conn
            .query_row(
                "SELECT modified_at FROM tracks WHERE file_path = ?1",
                params![file_path_str],
                |row| row.get(0),
            )
            .ok();

        if existing_mtime == Some(mtime) {
            scanned += 1;
            continue;
        }

        let track_data = read_track_for_library(file_path);
        upsert_track(conn, &track_data, mtime, now)?;

        scanned += 1;
    }

    // Remove tracks that no longer exist on disk for this folder
    let mut stmt = conn
        .prepare("SELECT file_path FROM tracks WHERE file_path LIKE ?1")
        .map_err(|e| format!("Query failed: {}", e))?;

    let db_paths: Vec<String> = stmt
        .query_map(params![format!("{}%", folder_path)], |row| row.get(0))
        .map_err(|e| format!("Query failed: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    for db_path in &db_paths {
        if !Path::new(db_path).exists() {
            conn.execute("DELETE FROM tracks WHERE file_path = ?1", params![db_path])
                .ok();
        }
    }

    Ok(scanned)
}

pub fn rescan_all_folders(
    conn: &Connection,
    app: &AppHandle,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<(), String> {
    let folders = get_folders(conn)?;

    let mut all_files: Vec<(PathBuf, String)> = Vec::new();
    for folder in &folders {
        let root = Path::new(&folder.path);
        if !root.exists() {
            continue;
        }
        let mut folder_files = Vec::new();
        collect_audio_files(root, &mut folder_files);
        for f in folder_files {
            all_files.push((f, folder.path.clone()));
        }
    }

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

        let file_path_str = file_path.to_string_lossy().to_string();
        let mtime = fs::metadata(file_path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let existing_mtime: Option<i64> = conn
            .query_row(
                "SELECT modified_at FROM tracks WHERE file_path = ?1",
                params![file_path_str],
                |row| row.get(0),
            )
            .ok();

        if existing_mtime == Some(mtime) {
            continue;
        }

        let track_data = read_track_for_library(file_path);
        upsert_track(conn, &track_data, mtime, now)?;
    }

    // Remove orphaned tracks for each folder
    for folder in &folders {
        let mut stmt = conn
            .prepare("SELECT file_path FROM tracks WHERE file_path LIKE ?1")
            .map_err(|e| format!("Query failed: {}", e))?;

        let db_paths: Vec<String> = stmt
            .query_map(params![format!("{}%", folder.path)], |row| row.get(0))
            .map_err(|e| format!("Query failed: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        for db_path in &db_paths {
            if !Path::new(db_path).exists() {
                conn.execute("DELETE FROM tracks WHERE file_path = ?1", params![db_path])
                    .ok();
            }
        }
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
    conn: &Connection,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<super::types::BackgroundScanResult, String> {
    let folders = get_folders(conn)?;

    let mut all_files: Vec<(PathBuf, String)> = Vec::new();
    for folder in &folders {
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

    let total = all_files.len();
    let now = now_epoch();
    let mut changed = 0;

    for (file_path, _folder_path) in &all_files {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err("Cancelled".to_string());
        }

        let file_path_str = file_path.to_string_lossy().to_string();
        let mtime = fs::metadata(file_path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let existing_mtime: Option<i64> = conn
            .query_row(
                "SELECT modified_at FROM tracks WHERE file_path = ?1",
                params![file_path_str],
                |row| row.get(0),
            )
            .ok();

        if existing_mtime == Some(mtime) {
            continue;
        }

        let track_data = read_track_for_library(file_path);
        upsert_track(conn, &track_data, mtime, now)?;
        changed += 1;
    }

    // Remove non-NFC duplicate entries left over from before path normalization.
    // If both NFC and NFD versions of a path exist, delete the non-NFC one.
    let mut removed = 0;
    {
        let mut stmt = conn
            .prepare("SELECT id, file_path FROM tracks")
            .map_err(|e| format!("Query failed: {}", e))?;
        let all_entries: Vec<(i64, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| format!("Query failed: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

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
    }

    // Remove orphaned tracks (files deleted from disk)
    for folder in &folders {
        let root = Path::new(&folder.path);
        if !root.exists() {
            continue;
        }

        let mut stmt = conn
            .prepare("SELECT file_path FROM tracks WHERE file_path LIKE ?1")
            .map_err(|e| format!("Query failed: {}", e))?;

        let db_paths: Vec<String> = stmt
            .query_map(params![format!("{}%", folder.path)], |row| row.get(0))
            .map_err(|e| format!("Query failed: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        for db_path in &db_paths {
            if !Path::new(db_path).exists() {
                conn.execute("DELETE FROM tracks WHERE file_path = ?1", params![db_path])
                    .ok();
                removed += 1;
            }
        }
    }

    // Persist the scan timestamp so we know when the last successful scan ran
    let _ = super::settings::set_setting(conn, "last_scan_timestamp", &now.to_string());

    Ok(super::types::BackgroundScanResult {
        changed,
        removed,
        total_scanned: total,
    })
}
