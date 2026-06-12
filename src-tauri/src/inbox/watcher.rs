use notify_debouncer_full::notify::{self, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, FileIdMap};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Watches the inbox folder and emits `inbox-changed` so the frontend can
/// rescan. Unlike the library watcher this touches no state — a lingering
/// callback after drop is harmless, so no suppression flag is needed.
pub struct InboxWatcher {
    inner: Mutex<Option<Debouncer<notify::RecommendedWatcher, FileIdMap>>>,
}

impl InboxWatcher {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }

    pub fn watch(&self, path: Option<PathBuf>, app: AppHandle) -> Result<(), String> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        *guard = None;

        let Some(path) = path.filter(|p| p.exists()) else {
            return Ok(());
        };

        let mut debouncer = new_debouncer(
            Duration::from_secs(2),
            None,
            move |events: DebounceEventResult| {
                let Ok(events) = events else { return };
                let relevant = events.iter().any(|e| e.paths.iter().any(|p| !is_hidden(p)));
                if relevant {
                    let _ = app.emit("inbox-changed", ());
                }
            },
        )
        .map_err(|e| format!("Failed to create inbox watcher: {}", e))?;

        debouncer
            .watch(&path, RecursiveMode::Recursive)
            .map_err(|e| format!("Failed to watch {}: {}", path.display(), e))?;

        *guard = Some(debouncer);
        log::info!("Inbox watcher started for {}", path.display());
        Ok(())
    }
}

fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.starts_with('.'))
        .unwrap_or(true)
}
