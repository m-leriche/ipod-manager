use crate::audio_utils::collect_audio_files;
use rayon::prelude::*;
use rusqlite::{params, Connection};
use std::collections::{HashMap, HashSet};
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

/// Minimum interval between launch-time background rescans. The filesystem
/// watcher picks up changes while the app runs, and Refresh forces a full
/// pass — so a recent scan makes the launch walk redundant.
const BACKGROUND_RESCAN_MIN_INTERVAL_SECS: i64 = 60 * 60;

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

    sync_files(
        conn,
        &audio_files,
        Some(folder_path),
        Some(app),
        cancel_flag,
    )?;

    // Remove tracks whose files no longer exist on disk for this folder.
    delete_orphans(conn, folder_path, &walked_set(&audio_files))?;

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
    sync_files(conn, &all_files, None, Some(app), cancel_flag)?;

    let walked = walked_set(&all_files);
    for folder in &folders {
        delete_orphans(conn, &folder.path, &walked)?;
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
        if last_scan_is_fresh(&c) {
            return Ok(super::types::BackgroundScanResult {
                changed: 0,
                removed: 0,
                total_scanned: 0,
            });
        }
        get_folders(&c)?
    };

    let all_files = collect_folder_files(&folders);
    let total = all_files.len();

    let changed = sync_files(conn, &all_files, None, None, cancel_flag)?;

    let mut removed = {
        let c = super::lock_shared(conn)?;
        run_nfc_dedup_once(&c)?
    };

    // Remove orphaned tracks (files deleted from disk)
    let walked = walked_set(&all_files);
    for folder in &folders {
        if !Path::new(&folder.path).exists() {
            continue;
        }
        removed += delete_orphans(conn, &folder.path, &walked)?;
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
    scope: Option<&str>,
    app: Option<&AppHandle>,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<usize, String> {
    if files.is_empty() {
        return Ok(0);
    }

    // One query for every stored mtime beats a SELECT per file; scope it to the
    // folder being scanned so a single-folder import doesn't load the whole table.
    let existing = load_mtimes(conn, scope)?;
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

/// Preload stored `(file_path → mtime)` pairs for the skip-unchanged check.
/// `scope` restricts the query to one folder prefix (single-folder scans);
/// `None` loads the whole library (full rescans, which touch every folder).
fn load_mtimes(
    conn: &super::SharedConn,
    scope: Option<&str>,
) -> Result<HashMap<String, i64>, String> {
    let c = super::lock_shared(conn)?;
    let to_pair = |row: &rusqlite::Row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?));
    let map = match scope {
        Some(folder) => {
            let mut stmt = c
                .prepare("SELECT file_path, modified_at FROM tracks WHERE file_path LIKE ?1")
                .map_err(|e| format!("Query failed: {}", e))?;
            let rows = stmt
                .query_map(params![format!("{}%", folder)], to_pair)
                .map_err(|e| format!("Query failed: {}", e))?;
            rows.filter_map(|r| r.ok()).collect()
        }
        None => {
            let mut stmt = c
                .prepare("SELECT file_path, modified_at FROM tracks")
                .map_err(|e| format!("Query failed: {}", e))?;
            let rows = stmt
                .query_map([], to_pair)
                .map_err(|e| format!("Query failed: {}", e))?;
            rows.filter_map(|r| r.ok()).collect()
        }
    };
    Ok(map)
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
        self.completed.fetch_add(1, Ordering::Relaxed);
        let Some(app) = self.app else {
            return;
        };
        // try_lock: if another worker is mid-emit, skip this tick rather than block.
        let Ok(mut last) = self.last_emit.try_lock() else {
            return;
        };
        // Read the counter under the lock so serialized emits stay monotonic
        // (a worker that incremented to 100 can't emit after one that hit 101).
        let completed = self.completed.load(Ordering::Relaxed);
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

/// True when the persisted `last_scan_timestamp` is recent enough that a
/// launch-time background rescan can be skipped entirely.
fn last_scan_is_fresh(c: &Connection) -> bool {
    super::settings::get_setting(c, "last_scan_timestamp")
        .and_then(|v| v.parse::<i64>().ok())
        .is_some_and(|ts| now_epoch() - ts < BACKGROUND_RESCAN_MIN_INTERVAL_SECS)
}

/// One-time cleanup of pre-normalization NFD duplicates, guarded by a settings
/// flag so the full-table scan doesn't run on every launch.
fn run_nfc_dedup_once(c: &Connection) -> Result<usize, String> {
    const FLAG: &str = "nfc_dedup_done";
    if super::settings::get_setting(c, FLAG).as_deref() == Some("1") {
        return Ok(0);
    }
    let removed = remove_non_nfc_duplicates(c)?;
    super::settings::set_setting(c, FLAG, "1")?;
    Ok(removed)
}

fn walked_set(files: &[PathBuf]) -> HashSet<String> {
    files
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect()
}

/// Delete rows under `folder_path` whose files the walk did not see.
/// Returns the number of rows removed.
///
/// The in-memory `walked` check clears live files without touching the
/// filesystem; only the (rare) unseen candidates pay the `is_ghost_path`
/// stat/canonicalize check, which re-verifies against the real filesystem so
/// a walk hiccup (e.g. an unreadable directory) can't mass-delete valid rows.
///
/// The snapshot query, the per-row check, and the DELETE all run under a single
/// lock so a row a concurrent writer (e.g. an import) inserts mid-scan can't be
/// caught in a stale snapshot and wrongly deleted. With the set check doing the
/// bulk of the work, holding the lock across the loop is cheap.
fn delete_orphans(
    conn: &super::SharedConn,
    folder_path: &str,
    walked: &HashSet<String>,
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
        if walked.contains(db_path) {
            continue;
        }
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
        assert_eq!(sync_files(&db, &files, None, None, &cancel).unwrap(), 2);
        assert_eq!(track_count(&db), 2);

        // Re-scan with nothing changed writes nothing.
        assert_eq!(sync_files(&db, &files, None, None, &cancel).unwrap(), 0);
        assert_eq!(track_count(&db), 2);
    }

    #[test]
    fn sync_files_rewrites_on_mtime_change() {
        let tmp = tempfile::tempdir().unwrap();
        let db = make_db(tmp.path());
        let cancel = Arc::new(AtomicBool::new(false));
        let f = write_fake_audio(tmp.path(), "a.mp3");
        let files = vec![f.clone()];

        assert_eq!(sync_files(&db, &files, None, None, &cancel).unwrap(), 1);
        assert_eq!(sync_files(&db, &files, None, None, &cancel).unwrap(), 0);

        // mtime is second-granularity, so wait past a second boundary before
        // rewriting to guarantee a distinct modified time.
        std::thread::sleep(Duration::from_millis(1100));
        fs::write(&f, b"changed content").unwrap();

        assert_eq!(sync_files(&db, &files, None, None, &cancel).unwrap(), 1);
        assert_eq!(track_count(&db), 1);
    }

    #[test]
    fn sync_files_bails_when_cancelled() {
        let tmp = tempfile::tempdir().unwrap();
        let db = make_db(tmp.path());
        let cancel = Arc::new(AtomicBool::new(true));
        let files = vec![write_fake_audio(tmp.path(), "a.mp3")];

        assert!(sync_files(&db, &files, None, None, &cancel).is_err());
        assert_eq!(track_count(&db), 0);
    }

    #[test]
    fn sync_files_folder_scoped_skips_unchanged() {
        let tmp = tempfile::tempdir().unwrap();
        let db = make_db(tmp.path());
        let cancel = Arc::new(AtomicBool::new(false));
        let files = vec![write_fake_audio(tmp.path(), "a.mp3")];
        let scope = tmp.path().to_string_lossy().to_string();

        // First scoped scan inserts; a second with the same scope skips it.
        assert_eq!(
            sync_files(&db, &files, Some(&scope), None, &cancel).unwrap(),
            1
        );
        assert_eq!(
            sync_files(&db, &files, Some(&scope), None, &cancel).unwrap(),
            0
        );
        assert_eq!(track_count(&db), 1);
    }

    #[test]
    fn delete_orphans_removes_only_missing_files() {
        let tmp = tempfile::tempdir().unwrap();
        let db = make_db(tmp.path());
        let cancel = Arc::new(AtomicBool::new(false));

        let present = write_fake_audio(tmp.path(), "present.mp3");
        let gone = write_fake_audio(tmp.path(), "gone.mp3");
        sync_files(&db, &[present.clone(), gone.clone()], None, None, &cancel).unwrap();
        assert_eq!(track_count(&db), 2);

        // The file backing one row disappears from disk.
        fs::remove_file(&gone).unwrap();

        let walked = walked_set(&[present.clone()]);
        let removed = delete_orphans(&db, &tmp.path().to_string_lossy(), &walked).unwrap();
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
    fn delete_orphans_keeps_walked_files() {
        let tmp = tempfile::tempdir().unwrap();
        let db = make_db(tmp.path());
        let cancel = Arc::new(AtomicBool::new(false));
        let files = vec![
            write_fake_audio(tmp.path(), "a.mp3"),
            write_fake_audio(tmp.path(), "b.mp3"),
        ];
        sync_files(&db, &files, None, None, &cancel).unwrap();

        let removed =
            delete_orphans(&db, &tmp.path().to_string_lossy(), &walked_set(&files)).unwrap();
        assert_eq!(removed, 0);
        assert_eq!(track_count(&db), 2);
    }

    #[test]
    fn delete_orphans_keeps_unwalked_files_still_on_disk() {
        // A file the walk missed (e.g. an unreadable directory) but that still
        // exists on disk must survive — is_ghost_path re-verifies against the
        // real filesystem before anything is deleted.
        let tmp = tempfile::tempdir().unwrap();
        let db = make_db(tmp.path());
        let cancel = Arc::new(AtomicBool::new(false));
        let files = vec![write_fake_audio(tmp.path(), "a.mp3")];
        sync_files(&db, &files, None, None, &cancel).unwrap();

        let removed = delete_orphans(&db, &tmp.path().to_string_lossy(), &HashSet::new()).unwrap();
        assert_eq!(removed, 0);
        assert_eq!(track_count(&db), 1);
    }

    #[test]
    fn background_rescan_skips_when_recently_scanned() {
        let tmp = tempfile::tempdir().unwrap();
        let db = make_db(tmp.path());
        let cancel = Arc::new(AtomicBool::new(false));
        write_fake_audio(tmp.path(), "a.mp3");
        {
            let c = lock_shared(&db).unwrap();
            crate::library::add_folder(&c, &tmp.path().to_string_lossy()).unwrap();
        }

        // First rescan walks the folder and stamps last_scan_timestamp.
        let first = background_rescan_all_folders(&db, &cancel).unwrap();
        assert_eq!(first.total_scanned, 1);

        // A file added right after must NOT be picked up by an immediate
        // second rescan — the freshness gate skips the walk entirely.
        write_fake_audio(tmp.path(), "b.mp3");
        let second = background_rescan_all_folders(&db, &cancel).unwrap();
        assert_eq!(second.total_scanned, 0);
        assert_eq!(second.changed, 0);

        // Expiring the timestamp re-enables the scan.
        {
            let c = lock_shared(&db).unwrap();
            let stale = now_epoch() - BACKGROUND_RESCAN_MIN_INTERVAL_SECS - 1;
            crate::library::set_setting(&c, "last_scan_timestamp", &stale.to_string()).unwrap();
        }
        let third = background_rescan_all_folders(&db, &cancel).unwrap();
        assert_eq!(third.total_scanned, 2);
        assert_eq!(third.changed, 1);
    }

    #[test]
    fn nfc_dedup_runs_once_then_is_flag_gated() {
        let tmp = tempfile::tempdir().unwrap();
        let db = make_db(tmp.path());
        let c = lock_shared(&db).unwrap();

        assert_eq!(run_nfc_dedup_once(&c).unwrap(), 0);
        assert_eq!(
            crate::library::get_setting(&c, "nfc_dedup_done").as_deref(),
            Some("1")
        );

        // Insert an NFD duplicate that a real dedup pass would remove — the
        // flag-gated call must skip it.
        let nfc = "/music/álbum.mp3".to_string();
        let nfd: String = nfc.chars().nfd().collect();
        for p in [&nfc, &nfd] {
            c.execute(
                "INSERT INTO tracks (file_path, file_name, folder_path, format) VALUES (?1, ?2, ?3, ?4)",
                params![p, "álbum.mp3", "/music", "mp3"],
            )
            .unwrap();
        }
        assert_eq!(run_nfc_dedup_once(&c).unwrap(), 0);
    }
}
