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
    delete_orphans(conn, folder_path, |p, _| !Path::new(p).exists())?;

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
        delete_orphans(conn, &folder.path, super::is_ghost_path)?;
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
        removed += delete_orphans(conn, &folder.path, super::is_ghost_path)?;
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

/// Delete rows under `folder_path` for which `should_delete` returns true.
/// Returns the number of rows removed.
///
/// The snapshot query, the per-row check, and the DELETE all run under a single
/// lock so a row a concurrent writer (e.g. an import) inserts mid-scan can't be
/// caught in a stale snapshot and wrongly deleted. The check is a cheap
/// filesystem stat — the expensive tag reads already ran unlocked — so holding
/// the lock across the loop is fine.
fn delete_orphans(
    conn: &super::SharedConn,
    folder_path: &str,
    should_delete: impl Fn(&str, &Connection) -> bool,
) -> Result<usize, String> {
    let c = super::lock_shared(conn)?;
    let db_paths: Vec<String> = {
        let mut stmt = c
            .prepare("SELECT file_path FROM tracks WHERE file_path LIKE ?1")
            .map_err(|e| format!("Query failed: {}", e))?;
        let paths = stmt
            .query_map(params![format!("{}%", folder_path)], |row| row.get(0))
            .map_err(|e| format!("Query failed: {}", e))?
            .filter_map(|r| r.ok())
            .collect();
        paths
    };

    let mut removed = 0;
    for db_path in &db_paths {
        if should_delete(db_path, &c) {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::{init_db, lock_shared, SharedConn};
    use std::sync::Mutex;

    fn make_db(dir: &Path) -> SharedConn {
        Arc::new(Mutex::new(
            init_db(&dir.join("library.db")).expect("init db"),
        ))
    }

    fn write_fake_audio(dir: &Path, name: &str) -> PathBuf {
        let p = dir.join(name);
        fs::write(&p, b"not really audio").expect("write file");
        p
    }

    fn track_count(db: &SharedConn) -> i64 {
        let c = lock_shared(db).unwrap();
        c.query_row("SELECT COUNT(*) FROM tracks", [], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn delete_orphans_removes_only_missing_files() {
        let tmp = tempfile::tempdir().unwrap();
        let db = make_db(tmp.path());
        let now = now_epoch();

        let present = write_fake_audio(tmp.path(), "present.mp3");
        let gone = write_fake_audio(tmp.path(), "gone.mp3");
        upsert_if_changed(&db, &present, now).unwrap();
        upsert_if_changed(&db, &gone, now).unwrap();
        assert_eq!(track_count(&db), 2);

        // The file backing one row disappears from disk.
        fs::remove_file(&gone).unwrap();

        let removed = delete_orphans(&db, &tmp.path().to_string_lossy(), |p, _| {
            !Path::new(p).exists()
        })
        .unwrap();
        assert_eq!(removed, 1);
        assert_eq!(track_count(&db), 1);

        // The row whose file still exists must survive.
        let survivor: String = {
            let c = lock_shared(&db).unwrap();
            c.query_row("SELECT file_path FROM tracks", [], |r| r.get(0))
                .unwrap()
        };
        assert_eq!(survivor, present.to_string_lossy());
    }

    #[test]
    fn delete_orphans_keeps_everything_when_predicate_is_false() {
        let tmp = tempfile::tempdir().unwrap();
        let db = make_db(tmp.path());
        let now = now_epoch();
        upsert_if_changed(&db, &write_fake_audio(tmp.path(), "a.mp3"), now).unwrap();
        upsert_if_changed(&db, &write_fake_audio(tmp.path(), "b.mp3"), now).unwrap();

        let removed = delete_orphans(&db, &tmp.path().to_string_lossy(), |_, _| false).unwrap();
        assert_eq!(removed, 0);
        assert_eq!(track_count(&db), 2);
    }
}
