use rayon::prelude::*;
use std::fs;
use std::io;
use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

use super::types::{CopyResult, SyncProgress};

fn copy_pool() -> &'static rayon::ThreadPool {
    static POOL: OnceLock<rayon::ThreadPool> = OnceLock::new();
    POOL.get_or_init(|| {
        rayon::ThreadPoolBuilder::new()
            .num_threads(4)
            .thread_name(|i| format!("copy-worker-{}", i))
            .build()
            .expect("failed to create copy thread pool")
    })
}

pub(super) struct CopyProgress {
    completed: AtomicUsize,
    total: AtomicUsize,
    last_emit: Mutex<Instant>,
    app: AppHandle,
    pub cancel_flag: Arc<AtomicBool>,
    phase: String,
}

impl CopyProgress {
    pub fn new(app: AppHandle, cancel_flag: Arc<AtomicBool>, phase: &str) -> Self {
        Self {
            completed: AtomicUsize::new(0),
            total: AtomicUsize::new(0),
            last_emit: Mutex::new(Instant::now() - Duration::from_millis(100)),
            app,
            cancel_flag,
            phase: phase.to_string(),
        }
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancel_flag.load(Ordering::Relaxed)
    }

    pub fn inc_total(&self, n: usize) {
        self.total.fetch_add(n, Ordering::Relaxed);
    }

    pub fn inc_completed(&self, file_name: &str) {
        self.completed.fetch_add(1, Ordering::Relaxed);
        self.maybe_emit(file_name);
    }

    fn maybe_emit(&self, file_name: &str) {
        let now = Instant::now();
        if let Ok(mut last) = self.last_emit.try_lock() {
            if now.duration_since(*last) >= Duration::from_millis(100) {
                *last = now;
                let _ = self.app.emit(
                    "sync-progress",
                    SyncProgress {
                        total: self.total.load(Ordering::Relaxed),
                        completed: self.completed.load(Ordering::Relaxed),
                        current_file: file_name.to_string(),
                        phase: self.phase.clone(),
                    },
                );
            }
        }
    }

    pub fn emit_final(&self, phase: &str) {
        let _ = self.app.emit(
            "sync-progress",
            SyncProgress {
                total: self.total.load(Ordering::Relaxed),
                completed: self.completed.load(Ordering::Relaxed),
                current_file: String::new(),
                phase: phase.to_string(),
            },
        );
    }
}

fn available_space(path: &Path) -> Option<u64> {
    let mount = path.ancestors().find(|p| p.exists())?;
    let output = Command::new("df").arg("-k").arg(mount).output().ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let line = stdout.lines().nth(1)?;
    let avail_kb: u64 = line.split_whitespace().nth(3)?.parse().ok()?;
    Some(avail_kb * 1024)
}

pub(super) fn is_no_space(err: &io::Error) -> bool {
    let code = err.raw_os_error();
    if code == Some(28) {
        return true;
    }
    let msg = err.to_string().to_lowercase();
    msg.contains("no space") || msg.contains("not enough space") || msg.contains("disk full")
}

pub(super) fn fmt_bytes(b: u64) -> String {
    if b < 1024 {
        return format!("{} B", b);
    }
    if b < 1048576 {
        return format!("{:.1} KB", b as f64 / 1024.0);
    }
    if b < 1073741824 {
        return format!("{:.1} MB", b as f64 / 1048576.0);
    }
    format!("{:.2} GB", b as f64 / 1073741824.0)
}

fn collect_copy_pairs(
    src: &Path,
    dest: &Path,
    cancel_flag: &AtomicBool,
    pairs: &mut Vec<(std::path::PathBuf, std::path::PathBuf)>,
) {
    if cancel_flag.load(Ordering::Relaxed) {
        return;
    }
    let entries = match fs::read_dir(src) {
        Ok(rd) => rd,
        Err(_) => return,
    };
    for entry in entries.filter_map(|e| e.ok()) {
        let src_child = entry.path();
        let dest_child = dest.join(entry.file_name());
        if src_child.is_dir() {
            collect_copy_pairs(&src_child, &dest_child, cancel_flag, pairs);
        } else {
            pairs.push((src_child, dest_child));
        }
    }
}

pub(super) fn copy_dir_parallel(src: &Path, dest: &Path, progress: &CopyProgress) -> Vec<String> {
    let mut pairs = Vec::new();
    collect_copy_pairs(src, dest, &progress.cancel_flag, &mut pairs);
    progress.inc_total(pairs.len());

    let errors = Mutex::new(Vec::new());
    copy_pool().install(|| {
        pairs.par_iter().for_each(|(src_file, dest_file)| {
            if progress.is_cancelled() {
                return;
            }
            if let Some(parent) = dest_file.parent() {
                if let Err(e) = fs::create_dir_all(parent) {
                    if let Ok(mut errs) = errors.lock() {
                        errs.push(format!("Create dir {}: {}", parent.display(), e));
                    }
                    return;
                }
            }
            match fs::copy(src_file, dest_file) {
                Ok(_) => {
                    let name = src_file
                        .file_name()
                        .map(|f| f.to_string_lossy().to_string())
                        .unwrap_or_default();
                    progress.inc_completed(&name);
                }
                Err(e) => {
                    let _ = fs::remove_file(dest_file);
                    if is_no_space(&e) {
                        progress.cancel_flag.store(true, Ordering::Relaxed);
                        if let Ok(mut errs) = errors.lock() {
                            errs.push("Disk full — stopped copying".to_string());
                        }
                    } else if let Ok(mut errs) = errors.lock() {
                        errs.push(format!("Copy {} failed: {}", src_file.display(), e));
                    }
                }
            }
        });
    });
    errors.into_inner().unwrap_or_else(|e| e.into_inner())
}

pub fn copy_file_list(
    operations: Vec<super::types::CopyOperation>,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
) -> CopyResult {
    let op_count = operations.len();
    let mut succeeded = 0;
    let mut failed = 0;
    let mut errors = Vec::new();
    let mut cancelled = false;

    if let Some(first_dest) = operations
        .first()
        .map(|op| Path::new(&op.dest_path).to_path_buf())
    {
        let needed: u64 = operations
            .iter()
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
                return CopyResult {
                    total: op_count,
                    succeeded: 0,
                    failed: op_count,
                    cancelled: false,
                    errors,
                };
            }
        }
    }

    let progress = CopyProgress::new(app, cancel_flag, "copying");

    let top_level_files = operations
        .iter()
        .filter(|op| !Path::new(&op.source_path).is_dir())
        .count();
    progress.inc_total(top_level_files);

    for op in &operations {
        if progress.is_cancelled() {
            cancelled = true;
            break;
        }

        let src = Path::new(&op.source_path);
        let dest = Path::new(&op.dest_path);

        if let Some(parent) = dest.parent() {
            if let Err(e) = fs::create_dir_all(parent) {
                errors.push(format!("{}: mkdir failed: {}", op.dest_path, e));
                failed += 1;
                continue;
            }
        }

        if src.is_dir() {
            let dir_errors = copy_dir_parallel(src, dest, &progress);
            if progress.is_cancelled() {
                cancelled = true;
                errors.extend(dir_errors);
                break;
            }
            if dir_errors.is_empty() {
                succeeded += 1;
            } else {
                errors.extend(dir_errors);
                failed += 1;
            }
        } else {
            let file_name = src
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_default();

            match fs::copy(src, dest) {
                Ok(_) => {
                    succeeded += 1;
                    progress.inc_completed(&file_name);
                }
                Err(e) => {
                    let _ = fs::remove_file(dest);

                    if is_no_space(&e) {
                        errors.push("Disk full — stopped copying".to_string());
                        failed += op_count - succeeded - failed;
                        break;
                    }

                    errors.push(format!("{}: {}", op.source_path, e));
                    failed += 1;
                }
            }
        }
    }

    progress.emit_final(if cancelled { "cancelled" } else { "done" });

    CopyResult {
        total: op_count,
        succeeded,
        failed,
        cancelled,
        errors,
    }
}

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
    let mut last_emit = Instant::now() - Duration::from_millis(100);

    for (i, path_str) in paths.iter().enumerate() {
        if cancel_flag.load(Ordering::Relaxed) {
            cancelled = true;
            break;
        }

        let file_name = Path::new(path_str)
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| path_str.clone());

        let now = Instant::now();
        if now.duration_since(last_emit) >= Duration::from_millis(100) {
            last_emit = now;
            let _ = app.emit(
                "sync-progress",
                SyncProgress {
                    total,
                    completed: i,
                    current_file: file_name,
                    phase: "deleting".to_string(),
                },
            );
        }

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

    let _ = app.emit(
        "sync-progress",
        SyncProgress {
            total,
            completed: succeeded + failed,
            current_file: String::new(),
            phase: if cancelled {
                "cancelled".to_string()
            } else {
                "done".to_string()
            },
        },
    );

    CopyResult {
        total,
        succeeded,
        failed,
        cancelled,
        errors,
    }
}
