use crate::audio_utils::is_audio;
use crate::library;
use notify_debouncer_full::notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, notify, DebounceEventResult, Debouncer, FileIdMap};
use rusqlite::Connection;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Tauri-managed state for the filesystem watcher.
pub struct FolderWatcher {
    inner: Mutex<Option<WatcherInner>>,
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
        }
    }

    /// Start (or restart) watching the given folder paths.
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

        // Drop previous watcher
        *guard = None;

        if paths.is_empty() {
            return Ok(());
        }

        let mut debouncer = new_debouncer(
            Duration::from_secs(3),
            None,
            move |events: DebounceEventResult| {
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

    /// Stop watching all paths.
    #[allow(dead_code)]
    pub fn stop(&self) {
        if let Ok(mut guard) = self.inner.lock() {
            *guard = None;
            log::info!("File watcher stopped");
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

    let conn = match db.lock() {
        Ok(c) => c,
        Err(_) => return,
    };

    let mut added_or_modified: Vec<PathBuf> = Vec::new();
    let mut removed: Vec<PathBuf> = Vec::new();

    for event in &events {
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

    // Dedup
    added_or_modified.sort();
    added_or_modified.dedup();
    removed.sort();
    removed.dedup();

    let mut add_count = 0usize;
    let mut remove_count = 0usize;

    // Handle removed files
    for path in &removed {
        let path_str = path.to_string_lossy();
        if conn
            .execute(
                "DELETE FROM tracks WHERE file_path = ?1",
                rusqlite::params![path_str.as_ref()],
            )
            .is_ok()
        {
            remove_count += 1;
        }
    }

    // Handle added/modified files
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    for path in &added_or_modified {
        let mtime = std::fs::metadata(path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        if let Some(track_data) = library::read_track_for_library(path) {
            if library::upsert_track(&conn, &track_data, mtime, now).is_ok() {
                add_count += 1;
            }
        }
    }

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

fn is_audio_file(path: &Path) -> bool {
    is_audio(path)
}
