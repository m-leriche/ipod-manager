use crate::library::LibraryDb;
use crate::watcher::FolderWatcher;
use notify_debouncer_full::notify::{self, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

/// Tauri-managed state for the macOS volume monitor.
/// Watches `/Volumes` for mount/unmount events and emits `volume-changed`
/// when the library transitions between available and unavailable.
pub struct VolumeMonitor {
    #[allow(dead_code)]
    inner: Mutex<Option<RecommendedWatcher>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct VolumeChangeEvent {
    pub library_available: bool,
}

impl VolumeMonitor {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }

    /// Start watching `/Volumes` for mount/unmount events.
    /// Must be called after `LibraryDb` and `FolderWatcher` are managed by the app.
    pub fn start(&self, app: AppHandle) -> Result<(), String> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;

        let was_available = Arc::new(Mutex::new(check_library_paths_available(&app)));

        let mut watcher =
            notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
                let event = match res {
                    Ok(e) => e,
                    Err(_) => return,
                };

                match event.kind {
                    EventKind::Create(_) | EventKind::Remove(_) => {}
                    _ => return,
                }

                // Short delay — macOS may report the directory before the FS is fully readable
                std::thread::sleep(std::time::Duration::from_millis(750));

                let now_available = check_library_paths_available(&app);
                let mut prev = match was_available.lock() {
                    Ok(g) => g,
                    Err(e) => e.into_inner(),
                };

                if now_available == *prev {
                    return;
                }
                *prev = now_available;
                drop(prev);

                let _ = app.emit(
                    "volume-changed",
                    VolumeChangeEvent {
                        library_available: now_available,
                    },
                );

                if now_available {
                    // Library just came online — restart file watcher so it watches the paths
                    let db_arc = app.state::<LibraryDb>().conn_arc();
                    let folder_watcher = app.state::<FolderWatcher>();
                    let _ = crate::watcher::restart_from_db(&folder_watcher, &app, &db_arc);

                    // Trigger frontend data refresh via the existing library-changed listener
                    let _ = app.emit(
                        "library-changed",
                        crate::watcher::LibraryChangeEvent {
                            added: 0,
                            removed: 0,
                        },
                    );

                    log::info!("Volume mounted — library available, watcher restarted");
                } else {
                    log::info!("Volume unmounted — library offline");
                }
            })
            .map_err(|e| format!("Failed to create volume watcher: {}", e))?;

        watcher
            .watch(Path::new("/Volumes"), RecursiveMode::NonRecursive)
            .map_err(|e| format!("Failed to watch /Volumes: {}", e))?;

        *guard = Some(watcher);
        log::info!("Volume monitor started, watching /Volumes");
        Ok(())
    }
}

/// Check if the configured library location path currently exists on disk.
fn check_library_paths_available(app: &AppHandle) -> bool {
    let db = app.state::<LibraryDb>();
    let conn = match db.conn.lock() {
        Ok(c) => c,
        Err(_) => return false,
    };

    match crate::library::get_library_location(&conn) {
        Some(loc) => Path::new(&loc).exists(),
        None => false,
    }
}
