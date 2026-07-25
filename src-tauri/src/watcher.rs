use crate::audio_utils::is_audio;
use crate::library;
use notify_debouncer_full::notify::RecursiveMode;
use notify_debouncer_full::{
    new_debouncer, notify, DebounceEventResult, DebouncedEvent, Debouncer, FileIdMap,
};
use rusqlite::Connection;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// How long a path stays suppressed after the app writes it. Must comfortably
/// exceed the debouncer window (3s) plus filesystem-event delivery latency, so
/// the watcher's callback still sees the entry when it finally fires. Kept short
/// enough that a genuine external re-edit of the same file isn't missed for long.
const SELF_WRITE_SUPPRESS_SECS: u64 = 30;

/// Paths the app itself just wrote, with the instant they were registered.
/// Shared with the debouncer callback so it can discard events it caused.
type RecentWrites = Arc<Mutex<HashMap<PathBuf, Instant>>>;

/// Tauri-managed state for the filesystem watcher.
///
/// `generation` guards against a replaced debouncer's background thread
/// modifying the database after a restart.  `notify-debouncer-full`'s `Drop` impl
/// only sets a stop flag with `Ordering::Relaxed` and does NOT join the thread —
/// so the thread can execute one final callback *after* the debouncer is
/// dropped, creating ghost records from partially-written files.  Each
/// `watch()` bumps `generation` and the callback captures the value current at
/// its creation; once a newer watcher bumps the counter, any lingering old
/// callback sees a mismatch and bails before touching the DB.  A generation
/// counter — unlike a boolean suppress flag that has to be set then cleared —
/// leaves no window in which a stale callback could slip through.
///
/// Metadata saves do *not* restart the watcher: rebuilding the debouncer walks
/// and stats the whole library.  They mark their own writes with
/// [`FolderWatcher::suppress_paths`] instead.
pub struct FolderWatcher {
    inner: Mutex<Option<WatcherInner>>,
    generation: Arc<AtomicU64>,
    recent_writes: RecentWrites,
}

struct WatcherInner {
    #[allow(dead_code)]
    debouncer: Debouncer<notify::RecommendedWatcher, FileIdMap>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LibraryChangeEvent {
    pub added: usize,
    pub removed: usize,
}

impl FolderWatcher {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
            generation: Arc::new(AtomicU64::new(0)),
            recent_writes: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Register paths the app is about to write (or just wrote) so the watcher
    /// discards the filesystem events they generate instead of re-syncing them
    /// and firing a redundant `library-changed` refresh. Callers pass both the
    /// pre- and post-move paths of any reorganized files.
    pub fn suppress_paths<I>(&self, paths: I)
    where
        I: IntoIterator<Item = PathBuf>,
    {
        let Ok(mut guard) = self.recent_writes.lock() else {
            return;
        };
        let now = Instant::now();
        guard.retain(|_, t| now.duration_since(*t).as_secs() < SELF_WRITE_SUPPRESS_SECS);
        for path in paths {
            guard.insert(path, now);
        }
    }

    /// Start (or restart) watching the given folder paths.
    ///
    /// Bumps the generation so the old watcher's lingering callbacks bail, then
    /// drops it and installs a fresh one bound to the new generation.
    pub fn watch(
        &self,
        paths: Vec<PathBuf>,
        app: AppHandle,
        db: Arc<Mutex<Connection>>,
    ) -> Result<(), String> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;

        // Bumping first means any lingering callback from the dropped debouncer
        // sees a generation mismatch and returns — no window to sneak through.
        let my_gen = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        *guard = None;

        if paths.is_empty() {
            return Ok(());
        }

        let generation = self.generation.clone();
        let recent_writes = self.recent_writes.clone();
        let mut debouncer = new_debouncer(
            Duration::from_secs(3),
            None,
            move |events: DebounceEventResult| {
                if generation.load(Ordering::SeqCst) != my_gen {
                    log::debug!("Watcher callback from a stale generation — discarding events");
                    return;
                }
                handle_fs_events(events, &app, &db, &recent_writes);
            },
        )
        .map_err(|e| format!("Failed to create watcher: {}", e))?;

        for path in &paths {
            if path.exists() {
                debouncer
                    .watch(path, RecursiveMode::Recursive)
                    .map_err(|e| format!("Failed to watch {}: {}", path.display(), e))?;
            }
        }

        *guard = Some(WatcherInner { debouncer });

        log::info!("File watcher started for {} folders", paths.len());
        Ok(())
    }
}

/// Reload watched paths from the database and restart the watcher.
pub fn restart_from_db(
    watcher: &FolderWatcher,
    app: &AppHandle,
    db_arc: &Arc<Mutex<Connection>>,
) -> Result<(), String> {
    let conn = db_arc.lock().map_err(|e| format!("DB lock: {}", e))?;
    let folders = library::get_folders(&conn)?;
    drop(conn);

    let paths: Vec<PathBuf> = folders
        .iter()
        .filter(|f| Path::new(&f.path).exists())
        .map(|f| PathBuf::from(&f.path))
        .collect();

    watcher.watch(paths, app.clone(), db_arc.clone())
}

// ── Event handling ──────────────────────────────────────────────

fn handle_fs_events(
    events: DebounceEventResult,
    app: &AppHandle,
    db: &Arc<Mutex<Connection>>,
    recent_writes: &RecentWrites,
) {
    let events = match events {
        Ok(e) => e,
        Err(errs) => {
            for e in errs {
                log::warn!("File watcher error: {}", e);
            }
            return;
        }
    };

    let (mut added_or_modified, mut removed) = classify_events(&events);
    drop_self_writes(recent_writes, &mut added_or_modified, &mut removed);
    if added_or_modified.is_empty() && removed.is_empty() {
        return;
    }

    let remove_count = delete_removed(db, &removed);

    // Tag reads run in parallel on the scan pool with no DB lock held;
    // `sync_files` takes the writer lock only for its short bulk-upsert
    // transaction, so a large batch can't stall other DB writers.
    let cancel = Arc::new(AtomicBool::new(false));
    let add_count = library::sync_files(db, &added_or_modified, None, None, &cancel).unwrap_or(0);

    if add_count > 0 || remove_count > 0 {
        log::info!(
            "Library auto-updated: {} added/modified, {} removed",
            add_count,
            remove_count
        );
        let _ = app.emit(
            "library-changed",
            LibraryChangeEvent {
                added: add_count,
                removed: remove_count,
            },
        );
    }
}

/// Split debounced events into deduped (added-or-modified, removed) audio
/// paths. Runs without the DB lock.
fn classify_events(events: &[DebouncedEvent]) -> (Vec<PathBuf>, Vec<PathBuf>) {
    let mut added_or_modified: Vec<PathBuf> = Vec::new();
    let mut removed: Vec<PathBuf> = Vec::new();

    for event in events {
        match event.kind {
            notify::EventKind::Create(_) | notify::EventKind::Modify(_) => {
                for path in &event.paths {
                    if is_audio_file(path) && path.exists() {
                        added_or_modified.push(path.clone());
                    }
                }
            }
            notify::EventKind::Remove(_) => {
                for path in &event.paths {
                    if is_audio_file(path) {
                        removed.push(path.clone());
                    }
                }
            }
            _ => {}
        }
    }

    added_or_modified.sort();
    added_or_modified.dedup();
    removed.sort();
    removed.dedup();
    (added_or_modified, removed)
}

/// Drop events for paths the app itself just wrote, so a metadata save's own
/// reorganization moves don't trigger a redundant re-sync and refresh. Matched
/// entries are left in the set to expire by time — a single move can surface as
/// more than one debounced batch.
fn drop_self_writes(
    recent_writes: &RecentWrites,
    added: &mut Vec<PathBuf>,
    removed: &mut Vec<PathBuf>,
) {
    let Ok(mut guard) = recent_writes.lock() else {
        return;
    };
    if guard.is_empty() {
        return;
    }
    let now = Instant::now();
    guard.retain(|_, t| now.duration_since(*t).as_secs() < SELF_WRITE_SUPPRESS_SECS);
    let is_self_write = |p: &PathBuf| guard.contains_key(p);
    added.retain(|p| !is_self_write(p));
    removed.retain(|p| !is_self_write(p));
}

/// Delete the removed paths' rows in one short transaction under the writer
/// lock. Returns the number of successful deletes.
fn delete_removed(db: &Arc<Mutex<Connection>>, removed: &[PathBuf]) -> usize {
    if removed.is_empty() {
        return 0;
    }
    let Ok(conn) = db.lock() else {
        return 0;
    };
    let Ok(tx) = conn.unchecked_transaction() else {
        return 0;
    };

    let mut count = 0;
    for path in removed {
        let path_str = path.to_string_lossy();
        if tx
            .execute(
                "DELETE FROM tracks WHERE file_path = ?1",
                rusqlite::params![path_str.as_ref()],
            )
            .is_ok()
        {
            count += 1;
        }
    }
    if tx.commit().is_err() {
        return 0;
    }
    count
}

fn is_audio_file(path: &Path) -> bool {
    let is_dot_file = path
        .file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.starts_with('.'))
        .unwrap_or(true);
    !is_dot_file && is_audio(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_apple_double_files() {
        assert!(!is_audio_file(Path::new("/music/._01-10 Song.flac")));
        assert!(!is_audio_file(Path::new("/music/._song.mp3")));
        assert!(!is_audio_file(Path::new("/music/.hidden.m4a")));
    }

    #[test]
    fn drop_self_writes_filters_suppressed_paths() {
        let watcher = FolderWatcher::new();
        let moved_from = PathBuf::from("/music/Artist/Album/01 Old.flac");
        let moved_to = PathBuf::from("/music/Artist/Album/01 New.flac");
        let external = PathBuf::from("/music/Other/Added.flac");
        watcher.suppress_paths([moved_from.clone(), moved_to.clone()]);

        // The reorganize's own move (old removed, new created) is dropped, but a
        // genuine external add still gets through.
        let mut added = vec![moved_to.clone(), external.clone()];
        let mut removed = vec![moved_from.clone()];
        drop_self_writes(&watcher.recent_writes, &mut added, &mut removed);

        assert_eq!(added, vec![external]);
        assert!(removed.is_empty());
    }

    #[test]
    fn drop_self_writes_noop_when_nothing_suppressed() {
        let recent: RecentWrites = Arc::new(Mutex::new(HashMap::new()));
        let mut added = vec![PathBuf::from("/music/a.flac")];
        let mut removed = vec![PathBuf::from("/music/b.flac")];
        drop_self_writes(&recent, &mut added, &mut removed);
        assert_eq!(added.len(), 1);
        assert_eq!(removed.len(), 1);
    }

    #[test]
    fn accepts_normal_audio_files() {
        assert!(is_audio_file(Path::new("/music/01-10 Song.flac")));
        assert!(is_audio_file(Path::new("/music/song.mp3")));
        assert!(is_audio_file(Path::new("/music/track.m4a")));
    }

    #[test]
    fn rejects_non_audio_files() {
        assert!(!is_audio_file(Path::new("/music/cover.jpg")));
        assert!(!is_audio_file(Path::new("/music/notes.txt")));
    }

    #[test]
    fn classifies_events_into_deduped_added_and_removed() {
        use notify::event::{CreateKind, ModifyKind, RemoveKind};
        use std::time::Instant;

        let dir = tempfile::tempdir().unwrap();
        let existing = dir.path().join("song.mp3");
        std::fs::write(&existing, b"x").unwrap();
        let gone = dir.path().join("gone.flac");
        let cover = dir.path().join("cover.jpg");

        let ev = |kind: notify::EventKind, path: &Path| {
            DebouncedEvent::new(
                notify::Event::new(kind).add_path(path.to_path_buf()),
                Instant::now(),
            )
        };

        let events = vec![
            ev(notify::EventKind::Create(CreateKind::File), &existing),
            // Duplicate path across create + modify — must dedup to one entry.
            ev(notify::EventKind::Modify(ModifyKind::Any), &existing),
            // Created but already vanished from disk — skipped.
            ev(notify::EventKind::Create(CreateKind::File), &gone),
            ev(notify::EventKind::Remove(RemoveKind::File), &gone),
            // Non-audio — ignored entirely.
            ev(notify::EventKind::Create(CreateKind::File), &cover),
        ];

        let (added, removed) = classify_events(&events);
        assert_eq!(added, vec![existing]);
        assert_eq!(removed, vec![gone]);
    }
}
