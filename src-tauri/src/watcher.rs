use crate::audio_utils::is_audio;
use crate::library;
use notify_debouncer_full::notify::RecursiveMode;
use notify_debouncer_full::{
    new_debouncer, notify, DebounceEventResult, DebouncedEvent, Debouncer, FileIdMap,
};
use rusqlite::Connection;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Tauri-managed state for the filesystem watcher.
///
/// `generation` guards against the debouncer's background thread modifying the
/// database after `stop()` or a restart.  `notify-debouncer-full`'s `Drop` impl
/// only sets a stop flag with `Ordering::Relaxed` and does NOT join the thread —
/// so the thread can execute one final callback *after* the debouncer is
/// dropped, racing with `save_metadata`'s tag-writing and creating ghost records
/// from partially-written files.  Each `watch()` bumps `generation` and the
/// callback captures the value current at its creation; once a newer watcher (or
/// `stop()`) bumps the counter, any lingering old callback sees a mismatch and
/// bails before touching the DB.  A generation counter — unlike a boolean
/// suppress flag that has to be set then cleared — leaves no window in which a
/// stale callback could slip through.
pub struct FolderWatcher {
    inner: Mutex<Option<WatcherInner>>,
    generation: Arc<AtomicU64>,
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
        let mut debouncer = new_debouncer(
            Duration::from_secs(3),
            None,
            move |events: DebounceEventResult| {
                if generation.load(Ordering::SeqCst) != my_gen {
                    log::debug!("Watcher callback from a stale generation — discarding events");
                    return;
                }
                handle_fs_events(events, &app, &db);
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

    /// Stop watching and suppress any lingering callbacks.
    ///
    /// The generation is bumped *before* the debouncer is dropped because
    /// `notify-debouncer-full`'s `Drop` uses `Ordering::Relaxed` and does not
    /// join its background thread.  That thread can fire one last callback
    /// after the drop — the bump ensures it sees a mismatch and returns.
    ///
    /// Use [`restart_from_db`] to start a fresh watcher afterward.
    pub fn stop(&self) {
        self.generation.fetch_add(1, Ordering::SeqCst);
        if let Ok(mut guard) = self.inner.lock() {
            *guard = None;
            log::info!("File watcher stopped (suppressed)");
        }
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

fn handle_fs_events(events: DebounceEventResult, app: &AppHandle, db: &Arc<Mutex<Connection>>) {
    let events = match events {
        Ok(e) => e,
        Err(errs) => {
            for e in errs {
                log::warn!("File watcher error: {}", e);
            }
            return;
        }
    };

    let (added_or_modified, removed) = classify_events(&events);
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
