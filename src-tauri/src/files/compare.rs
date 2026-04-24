use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::UNIX_EPOCH;

use super::types::CompareEntry;

fn collect_files(
    base: &Path,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<HashMap<String, (u64, u64)>, String> {
    let mut map = HashMap::new();
    collect_files_recursive(base, base, &mut map, cancel_flag)?;
    Ok(map)
}

fn collect_files_recursive(
    base: &Path,
    current: &Path,
    map: &mut HashMap<String, (u64, u64)>,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<(), String> {
    if cancel_flag.load(Ordering::Relaxed) {
        return Err("Cancelled".to_string());
    }

    let entries =
        fs::read_dir(current).map_err(|e| format!("Cannot read {}: {}", current.display(), e))?;

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

        if entry.file_type().is_ok_and(|ft| ft.is_symlink()) {
            continue;
        }

        if metadata.is_dir() {
            collect_files_recursive(base, &path, map, cancel_flag)?;
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

pub fn compare_dirs(
    source: &str,
    target: &str,
    cancel_flag: Arc<AtomicBool>,
) -> Result<Vec<CompareEntry>, String> {
    let source_path = Path::new(source)
        .canonicalize()
        .map_err(|e| format!("Invalid source path: {}", e))?;
    let target_path = Path::new(target)
        .canonicalize()
        .map_err(|e| format!("Invalid target path: {}", e))?;

    let source_files = collect_files(&source_path, &cancel_flag)?;
    let target_files = collect_files(&target_path, &cancel_flag)?;

    let mut results: Vec<CompareEntry> = Vec::new();

    for (rel_path, (src_size, src_mod)) in &source_files {
        if let Some((tgt_size, tgt_mod)) = target_files.get(rel_path) {
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

    results.sort_by(|a, b| {
        let priority = |s: &str| match s {
            "source_only" => 0,
            "modified" => 1,
            "target_only" => 2,
            "same" => 3,
            _ => 4,
        };
        priority(&a.status).cmp(&priority(&b.status)).then_with(|| {
            a.relative_path
                .to_lowercase()
                .cmp(&b.relative_path.to_lowercase())
        })
    });

    Ok(results)
}
