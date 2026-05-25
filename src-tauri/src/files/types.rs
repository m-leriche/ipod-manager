use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Serialize)]
pub struct FileEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CompareEntry {
    pub relative_path: String,
    pub is_dir: bool,
    pub source_size: Option<u64>,
    pub target_size: Option<u64>,
    pub source_modified: Option<u64>,
    pub target_modified: Option<u64>,
    pub status: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CopyOperation {
    pub source_path: String,
    pub dest_path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CopyResult {
    pub total: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub cancelled: bool,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncProgress {
    pub total: usize,
    pub completed: usize,
    pub current_file: String,
    pub phase: String,
}

/// Macro for cancel flag types — each operation gets its own Tauri-managed type
/// with identical cancel/new_flag logic.
macro_rules! cancel_flag {
    ($(#[$meta:meta])* $name:ident) => {
        $(#[$meta])*
        pub struct $name(Mutex<Arc<AtomicBool>>);

        impl $name {
            pub fn new() -> Self {
                Self(Mutex::new(Arc::new(AtomicBool::new(false))))
            }
            pub fn cancel(&self) {
                if let Ok(guard) = self.0.lock() {
                    guard.store(true, Ordering::SeqCst);
                }
            }
            pub fn new_flag(&self) -> Arc<AtomicBool> {
                let flag = Arc::new(AtomicBool::new(false));
                if let Ok(mut guard) = self.0.lock() {
                    *guard = flag.clone();
                }
                flag
            }
        }
    };
}

cancel_flag!(SyncCancel);
cancel_flag!(
    /// Independent cancel flag for background album art repair.
    ArtRepairCancel
);
cancel_flag!(
    /// Independent cancel flag for background lyrics fetching.
    LyricsCancel
);
cancel_flag!(
    /// Independent cancel flag for new releases checking.
    NewReleasesCancel
);
