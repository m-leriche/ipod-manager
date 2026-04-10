use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
pub struct FileEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    /// Seconds since UNIX epoch
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
    /// "source_only" | "target_only" | "modified" | "same"
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
    pub phase: String, // "copying" | "deleting"
}

/// Shared cancellation flag for sync operations.
/// Uses Arc<AtomicBool> so it can be cloned and sent to background threads.
pub struct SyncCancel(pub Arc<AtomicBool>);

impl SyncCancel {
    pub fn new() -> Self {
        Self(Arc::new(AtomicBool::new(false)))
    }
    pub fn reset(&self) {
        self.0.store(false, Ordering::SeqCst);
    }
    pub fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }
    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
    pub fn flag(&self) -> Arc<AtomicBool> {
        self.0.clone()
    }
}

/// List the contents of any directory on the filesystem.
pub fn list_dir(path: &str) -> Result<Vec<FileEntry>, String> {
    let resolved = Path::new(path)
        .canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;

    let entries = fs::read_dir(&resolved)
        .map_err(|e| format!("Cannot read directory: {}", e))?;

    let mut results: Vec<FileEntry> = Vec::new();

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files (starting with .)
        if name.starts_with('.') {
            continue;
        }

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        let is_dir = metadata.is_dir();
        let size = if is_dir { 0 } else { metadata.len() };
        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        results.push(FileEntry {
            name,
            is_dir,
            size,
            modified,
        });
    }

    // Sort: folders first, then files, alphabetical within each group
    results.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(results)
}

/// Recursively collect all files (not directories) under a path,
/// returning a map of relative_path -> (size, modified).
fn collect_files(base: &Path) -> Result<HashMap<String, (u64, u64)>, String> {
    let mut map = HashMap::new();
    collect_files_recursive(base, base, &mut map)?;
    Ok(map)
}

fn collect_files_recursive(
    base: &Path,
    current: &Path,
    map: &mut HashMap<String, (u64, u64)>,
) -> Result<(), String> {
    let entries = fs::read_dir(current)
        .map_err(|e| format!("Cannot read {}: {}", current.display(), e))?;

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }

        let path = entry.path();
        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        if metadata.is_dir() {
            collect_files_recursive(base, &path, map)?;
        } else {
            let relative = path
                .strip_prefix(base)
                .map_err(|_| "Failed to compute relative path".to_string())?
                .to_string_lossy()
                .to_string();

            let size = metadata.len();
            let modified = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);

            map.insert(relative, (size, modified));
        }
    }

    Ok(())
}

/// Compare two directories recursively. Returns a list of entries showing
/// what's in source only, target only, modified, or same.
pub fn compare_dirs(source: &str, target: &str) -> Result<Vec<CompareEntry>, String> {
    let source_path = Path::new(source)
        .canonicalize()
        .map_err(|e| format!("Invalid source path: {}", e))?;
    let target_path = Path::new(target)
        .canonicalize()
        .map_err(|e| format!("Invalid target path: {}", e))?;

    let source_files = collect_files(&source_path)?;
    let target_files = collect_files(&target_path)?;

    let mut results: Vec<CompareEntry> = Vec::new();

    // Check all source files
    for (rel_path, (src_size, src_mod)) in &source_files {
        if let Some((tgt_size, tgt_mod)) = target_files.get(rel_path) {
            // File exists in both
            let status = if src_size == tgt_size {
                "same".to_string()
            } else {
                "modified".to_string()
            };
            results.push(CompareEntry {
                relative_path: rel_path.clone(),
                is_dir: false,
                source_size: Some(*src_size),
                target_size: Some(*tgt_size),
                source_modified: Some(*src_mod),
                target_modified: Some(*tgt_mod),
                status,
            });
        } else {
            // Only in source
            results.push(CompareEntry {
                relative_path: rel_path.clone(),
                is_dir: false,
                source_size: Some(*src_size),
                target_size: None,
                source_modified: Some(*src_mod),
                target_modified: None,
                status: "source_only".to_string(),
            });
        }
    }

    // Check target-only files
    for (rel_path, (tgt_size, tgt_mod)) in &target_files {
        if !source_files.contains_key(rel_path) {
            results.push(CompareEntry {
                relative_path: rel_path.clone(),
                is_dir: false,
                source_size: None,
                target_size: Some(*tgt_size),
                source_modified: None,
                target_modified: Some(*tgt_mod),
                status: "target_only".to_string(),
            });
        }
    }

    // Sort by status priority (source_only first, then modified, target_only, same)
    // then by path
    results.sort_by(|a, b| {
        let priority = |s: &str| match s {
            "source_only" => 0,
            "modified" => 1,
            "target_only" => 2,
            "same" => 3,
            _ => 4,
        };
        priority(&a.status)
            .cmp(&priority(&b.status))
            .then_with(|| a.relative_path.to_lowercase().cmp(&b.relative_path.to_lowercase()))
    });

    Ok(results)
}

/// Check available disk space at the given path (bytes).
fn available_space(path: &Path) -> Option<u64> {
    // Use `df` to get available space — works reliably on macOS for all volume types
    let mount = path.ancestors()
        .find(|p| p.exists())?;
    let output = Command::new("df")
        .arg("-k") // 1K blocks
        .arg(mount)
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    // Second line, 4th column is available 1K-blocks
    let line = stdout.lines().nth(1)?;
    let avail_kb: u64 = line.split_whitespace().nth(3)?.parse().ok()?;
    Some(avail_kb * 1024)
}

/// Check if an I/O error is a disk-full condition.
fn is_no_space(err: &io::Error) -> bool {
    // ErrorKind::StorageFull on nightly; fall back to raw OS code + message matching
    let code = err.raw_os_error();
    // ENOSPC = 28 on macOS/Linux
    if code == Some(28) {
        return true;
    }
    let msg = err.to_string().to_lowercase();
    msg.contains("no space") || msg.contains("not enough space") || msg.contains("disk full")
}

fn fmt_bytes(b: u64) -> String {
    if b < 1024 { return format!("{} B", b); }
    if b < 1048576 { return format!("{:.1} KB", b as f64 / 1024.0); }
    if b < 1073741824 { return format!("{:.1} MB", b as f64 / 1048576.0); }
    format!("{:.2} GB", b as f64 / 1073741824.0)
}

/// Copy files with per-file progress events and cancellation support.
/// Accepts Arc<AtomicBool> so this can run on a background thread.
pub fn copy_file_list(
    operations: Vec<CopyOperation>,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
) -> CopyResult {
    let total = operations.len();
    let mut succeeded = 0;
    let mut failed = 0;
    let mut errors = Vec::new();
    let mut cancelled = false;

    cancel_flag.store(false, Ordering::SeqCst);

    // Pre-flight: estimate required space vs available
    if let Some(first_dest) = operations.first().map(|op| Path::new(&op.dest_path).to_path_buf()) {
        let needed: u64 = operations.iter()
            .filter_map(|op| fs::metadata(&op.source_path).ok())
            .map(|m| m.len())
            .sum();

        if let Some(avail) = available_space(&first_dest) {
            if needed > avail {
                errors.push(format!(
                    "Not enough disk space: need {} but only {} available",
                    fmt_bytes(needed),
                    fmt_bytes(avail),
                ));
                return CopyResult { total, succeeded: 0, failed: total, cancelled: false, errors };
            }
        }
    }

    for (i, op) in operations.iter().enumerate() {
        if cancel_flag.load(Ordering::SeqCst) {
            cancelled = true;
            break;
        }

        let file_name = Path::new(&op.source_path)
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| op.source_path.clone());

        let _ = app.emit("sync-progress", SyncProgress {
            total,
            completed: i,
            current_file: file_name,
            phase: "copying".to_string(),
        });

        let src = Path::new(&op.source_path);
        let dest = Path::new(&op.dest_path);

        if let Some(parent) = dest.parent() {
            if let Err(e) = fs::create_dir_all(parent) {
                errors.push(format!("{}: mkdir failed: {}", op.dest_path, e));
                failed += 1;
                continue;
            }
        }

        match fs::copy(src, dest) {
            Ok(_) => succeeded += 1,
            Err(e) => {
                // Clean up partial file
                let _ = fs::remove_file(dest);

                if is_no_space(&e) {
                    errors.push("Disk full — stopped copying".to_string());
                    failed += total - i - succeeded;
                    break;
                }

                errors.push(format!("{}: {}", op.source_path, e));
                failed += 1;
            }
        }
    }

    let _ = app.emit("sync-progress", SyncProgress {
        total,
        completed: succeeded + failed,
        current_file: String::new(),
        phase: if cancelled { "cancelled".to_string() } else { "done".to_string() },
    });

    CopyResult { total, succeeded, failed, cancelled, errors }
}

/// Delete files with per-file progress events and cancellation support.
/// Accepts Arc<AtomicBool> so this can run on a background thread.
pub fn delete_file_list(
    paths: Vec<String>,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
) -> CopyResult {
    let total = paths.len();
    let mut succeeded = 0;
    let mut failed = 0;
    let mut errors = Vec::new();
    let mut cancelled = false;

    cancel_flag.store(false, Ordering::SeqCst);

    for (i, path_str) in paths.iter().enumerate() {
        if cancel_flag.load(Ordering::SeqCst) {
            cancelled = true;
            break;
        }

        let file_name = Path::new(path_str)
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| path_str.clone());

        let _ = app.emit("sync-progress", SyncProgress {
            total,
            completed: i,
            current_file: file_name,
            phase: "deleting".to_string(),
        });

        let path = Path::new(path_str);
        if !path.exists() {
            succeeded += 1;
            continue;
        }

        let result = if path.is_dir() {
            fs::remove_dir_all(path)
        } else {
            fs::remove_file(path)
        };

        match result {
            Ok(_) => succeeded += 1,
            Err(e) => {
                errors.push(format!("{}: {}", path_str, e));
                failed += 1;
            }
        }
    }

    let _ = app.emit("sync-progress", SyncProgress {
        total,
        completed: succeeded + failed,
        current_file: String::new(),
        phase: if cancelled { "cancelled".to_string() } else { "done".to_string() },
    });

    CopyResult { total, succeeded, failed, cancelled, errors }
}
