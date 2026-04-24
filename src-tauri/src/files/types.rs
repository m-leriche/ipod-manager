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

pub struct SyncCancel(Mutex<Arc<AtomicBool>>);

impl SyncCancel {
    pub fn new() -> Self {
        Self(Mutex::new(Arc::new(AtomicBool::new(false))))
    }
    pub fn cancel(&self) {
        self.0.lock().unwrap().store(true, Ordering::Relaxed);
    }
    pub fn new_flag(&self) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        *self.0.lock().unwrap() = flag.clone();
        flag
    }
}
