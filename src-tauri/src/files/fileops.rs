use std::fs;
use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::AppHandle;

use super::copy::{copy_dir_parallel, CopyProgress};
use super::types::{CopyOperation, CopyResult};

pub fn rename_entry(old_path: &str, new_path: &str) -> Result<(), String> {
    let old = Path::new(old_path);
    let new = Path::new(new_path);

    if !old.exists() {
        return Err(format!("Source does not exist: {}", old_path));
    }
    if new.exists() {
        return Err(format!("Destination already exists: {}", new_path));
    }

    fs::rename(old, new).map_err(|e| format!("Rename failed: {}", e))
}

pub fn create_folder(path: &str) -> Result<(), String> {
    let p = Path::new(path);

    if p.exists() {
        return Err(format!("Already exists: {}", path));
    }

    let parent = p.parent().ok_or("Invalid path")?;
    if !parent.exists() {
        return Err(format!(
            "Parent directory does not exist: {}",
            parent.display()
        ));
    }

    fs::create_dir(p).map_err(|e| format!("Create folder failed: {}", e))
}

pub fn move_file_list(
    operations: Vec<CopyOperation>,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
) -> CopyResult {
    let op_count = operations.len();
    let mut succeeded = 0;
    let mut failed = 0;
    let mut cancelled = false;
    let mut errors: Vec<String> = Vec::new();

    let progress = CopyProgress::new(app, cancel_flag, "moving");
    progress.inc_total(op_count);

    for op in &operations {
        if progress.is_cancelled() {
            cancelled = true;
            break;
        }

        let dest = Path::new(&op.dest_path);
        if let Some(parent) = dest.parent() {
            if !parent.exists() {
                if let Err(e) = fs::create_dir_all(parent) {
                    errors.push(format!("{}: {}", op.source_path, e));
                    failed += 1;
                    continue;
                }
            }
        }

        match move_single(&op.source_path, &op.dest_path, &progress) {
            Ok(()) => succeeded += 1,
            Err(e) => {
                if progress.is_cancelled() {
                    cancelled = true;
                    errors.push(e);
                    break;
                }
                errors.push(format!("{}: {}", op.source_path, e));
                failed += 1;
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

fn move_single(source: &str, dest: &str, progress: &CopyProgress) -> Result<(), String> {
    match fs::rename(source, dest) {
        Ok(()) => {
            let name = Path::new(source)
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_default();
            progress.inc_completed(&name);
            return Ok(());
        }
        Err(e) => {
            if e.raw_os_error() != Some(18) {
                return Err(format!("Move failed: {}", e));
            }
        }
    }

    let src_path = Path::new(source);
    if src_path.is_dir() {
        let dir_errors = copy_dir_parallel(src_path, Path::new(dest), progress);
        if !dir_errors.is_empty() {
            return Err(dir_errors.join("; "));
        }
        fs::remove_dir_all(src_path).map_err(|e| format!("Remove source dir failed: {}", e))
    } else {
        fs::copy(source, dest).map_err(|e| format!("Copy failed: {}", e))?;
        fs::remove_file(source).map_err(|e| format!("Remove source failed: {}", e))?;
        let name = Path::new(source)
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_default();
        progress.inc_completed(&name);
        Ok(())
    }
}
