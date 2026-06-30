use crate::audio_utils::collect_audio_files;
use rayon::prelude::*;
use rusqlite::{params, Connection};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use unicode_normalization::UnicodeNormalization;

use super::folders::get_folders;
use super::now_epoch;
use super::track_io::{read_track_for_library, upsert_track};
use super::types::{LibraryScanProgress, TrackData};

/// Emit at most one progress event per file completion within this window.
const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);

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

    sync_files(conn, &audio_files, Some(app), cancel_flag)?;

    // Remove tracks whose files no longer exist on disk for this folder.
    delete_orphans(conn, folder_path, |p, _| !Path::new(p).exists())?;

    Ok(total)
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
    sync_files(conn, &all_files, Some(app), cancel_flag)?;

    for folder in &folders {
        delete_orphans(conn, &folder.path, super::is_ghost_path)?;
    }

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

    let changed = sync_files(conn, &all_files, None, cancel_flag)?;

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
        let _ = super::settings::set_setting(&c, "last_scan_timestamp", &now_epoch().to_string());
    }

    Ok(super::types::BackgroundScanResult {
        changed,
        removed,
        total_scanned: total,
    })
}

// ── Parallel scan core ─────────────────────────────────────────

/// Dedicated pool for tag reads. Bounded so the occasional `ffprobe` fallback
/// can't spawn one subprocess per CPU thread on a huge library.
fn scan_pool() -> &'static rayon::ThreadPool {
    static POOL: OnceLock<rayon::ThreadPool> = OnceLock::new();
    POOL.get_or_init(|| {
        let threads = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4)
            .clamp(2, 8);
        rayon::ThreadPoolBuilder::new()
            .num_threads(threads)
            .thread_name(|i| format!("scan-worker-{}", i))
            .build()
            .expect("static thread pool with fixed config")
    })
}

/// Read tags (in parallel) for every file whose on-disk mtime differs from the
/// stored value, then bulk-upsert the changes in one transaction. Returns the
/// number of tracks (re)written. The slow tag reads hold no DB lock; the lock
/// is taken only for the mtime preload and the final transaction.
fn sync_files(
    conn: &super::SharedConn,
    files: &[PathBuf],
    app: Option<&AppHandle>,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<usize, String> {
    if files.is_empty() {
        return Ok(0);
    }

    // One query for every stored mtime beats a SELECT per file.
    let existing = load_mtimes(conn)?;
    let progress = ScanProgress::new(app, files.len());
    let now = now_epoch();

    // Parallel stat + tag read, fully lock-free. Unchanged files yield None.
    let changed: Vec<(TrackData, i64)> = scan_pool().install(|| {
        files
            .par_iter()
            .filter_map(|file_path| {
                if cancel_flag.load(Ordering::SeqCst) {
                    return None;
                }
                progress.tick(file_path);

                let file_path_str = file_path.to_string_lossy().to_string();
                let mtime = file_mtime(file_path);
                if existing.get(&file_path_str) == Some(&mtime) {
                    return None;
                }
                Some((read_track_for_library(file_path), mtime))
            })
            .collect()
    });

    if cancel_flag.load(Ordering::SeqCst) {
        return Err("Cancelled".to_string());
    }

    let written = changed.len();
    if written > 0 {
        let c = super::lock_shared(conn)?;
        let tx = c
            .unchecked_transaction()
            .map_err(|e| format!("Transaction failed: {}", e))?;
        for (track_data, mtime) in &changed {
            upsert_track(&tx, track_data, *mtime, now)?;
        }
        tx.commit().map_err(|e| format!("Commit failed: {}", e))?;
    }

    progress.emit_final();
    Ok(written)
}

fn load_mtimes(conn: &super::SharedConn) -> Result<HashMap<String, i64>, String> {
    let c = super::lock_shared(conn)?;
    let mut stmt = c
        .prepare("SELECT file_path, modified_at FROM tracks")
        .map_err(|e| format!("Query failed: {}", e))?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|e| format!("Query failed: {}", e))?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

fn file_mtime(path: &Path) -> i64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Throttled, thread-safe scan progress emitter. Emits `library-scan-progress`
/// at most once per [`PROGRESS_INTERVAL`]; `app` is `None` for silent scans.
struct ScanProgress<'a> {
    app: Option<&'a AppHandle>,
    total: usize,
    completed: AtomicUsize,
    last_emit: Mutex<Instant>,
}

impl<'a> ScanProgress<'a> {
    fn new(app: Option<&'a AppHandle>, total: usize) -> Self {
        Self {
            app,
            total,
            completed: AtomicUsize::new(0),
            // Backdate so the very first completed file emits immediately.
            last_emit: Mutex::new(Instant::now() - PROGRESS_INTERVAL),
        }
    }

    fn tick(&self, file_path: &Path) {
        let completed = self.completed.fetch_add(1, Ordering::Relaxed) + 1;
        let Some(app) = self.app else {
            return;
        };
        // try_lock: if another worker is mid-emit, skip this tick rather than block.
        let Ok(mut last) = self.last_emit.try_lock() else {
            return;
        };
        let now = Instant::now();
        if now.duration_since(*last) < PROGRESS_INTERVAL && completed != self.total {
            return;
        }
        *last = now;
        let file_name = file_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let _ = app.emit(
            "library-scan-progress",
            LibraryScanProgress {
                total: self.total,
                completed,
                current_file: file_name,
            },
        );
    }

    fn emit_final(&self) {
        if let Some(app) = self.app {
            let _ = app.emit(
                "library-scan-progress",
                LibraryScanProgress {
                    total: self.total,
                    completed: self.total,
                    current_file: String::new(),
                },
            );
        }
    }
}

fn collect_folder_files(folders: &[super::types::LibraryFolder]) -> Vec<PathBuf> {
    let mut all_files: Vec<PathBuf> = Vec::new();
    for folder in folders {
        let root = Path::new(&folder.path);
        if !root.exists() {
            continue; // External drive may be disconnected — skip silently
        }
        collect_audio_files(root, &mut all_files);
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
    fn sync_files_inserts_then_skips_unchanged() {
        let tmp = tempfile::tempdir().unwrap();
        let db = make_db(tmp.path());
        let cancel = Arc::new(AtomicBool::new(false));
        let files = vec![
            write_fake_audio(tmp.path(), "a.mp3"),
            write_fake_audio(tmp.path(), "b.mp3"),
        ];

        // First scan writes both files.
        assert_eq!(sync_files(&db, &files, None, &cancel).unwrap(), 2);
        assert_eq!(track_count(&db), 2);

        // Re-scan with nothing changed writes nothing.
        assert_eq!(sync_files(&db, &files, None, &cancel).unwrap(), 0);
        assert_eq!(track_count(&db), 2);
    }

    #[test]
    fn sync_files_rewrites_on_mtime_change() {
        let tmp = tempfile::tempdir().unwrap();
        let db = make_db(tmp.path());
        let cancel = Arc::new(AtomicBool::new(false));
        let f = write_fake_audio(tmp.path(), "a.mp3");
        let files = vec![f.clone()];

        assert_eq!(sync_files(&db, &files, None, &cancel).unwrap(), 1);
        assert_eq!(sync_files(&db, &files, None, &cancel).unwrap(), 0);

        // mtime is second-granularity, so wait past a second boundary before
        // rewriting to guarantee a distinct modified time.
        std::thread::sleep(Duration::from_millis(1100));
        fs::write(&f, b"changed content").unwrap();

        assert_eq!(sync_files(&db, &files, None, &cancel).unwrap(), 1);
        assert_eq!(track_count(&db), 1);
    }

    #[test]
    fn sync_files_bails_when_cancelled() {
        let tmp = tempfile::tempdir().unwrap();
        let db = make_db(tmp.path());
        let cancel = Arc::new(AtomicBool::new(true));
        let files = vec![write_fake_audio(tmp.path(), "a.mp3")];

        assert!(sync_files(&db, &files, None, &cancel).is_err());
        assert_eq!(track_count(&db), 0);
    }

    #[test]
    fn delete_orphans_removes_only_missing_files() {
        let tmp = tempfile::tempdir().unwrap();
        let db = make_db(tmp.path());
        let cancel = Arc::new(AtomicBool::new(false));

        let present = write_fake_audio(tmp.path(), "present.mp3");
        let gone = write_fake_audio(tmp.path(), "gone.mp3");
        sync_files(&db, &[present.clone(), gone.clone()], None, &cancel).unwrap();
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
        let cancel = Arc::new(AtomicBool::new(false));
        let files = vec![
            write_fake_audio(tmp.path(), "a.mp3"),
            write_fake_audio(tmp.path(), "b.mp3"),
        ];
        sync_files(&db, &files, None, &cancel).unwrap();

        let removed = delete_orphans(&db, &tmp.path().to_string_lossy(), |_, _| false).unwrap();
        assert_eq!(removed, 0);
        assert_eq!(track_count(&db), 2);
    }
}
