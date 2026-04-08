use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

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
    pub errors: Vec<String>,
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

/// Copy files from source paths to destination paths.
/// Each operation specifies source_path and dest_path as absolute paths.
pub fn copy_file_list(operations: &[CopyOperation]) -> CopyResult {
    let total = operations.len();
    let mut succeeded = 0;
    let mut failed = 0;
    let mut errors = Vec::new();

    for op in operations {
        let src = Path::new(&op.source_path);
        let dest = Path::new(&op.dest_path);

        // Create parent directories if needed
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
                errors.push(format!("{}: {}", op.source_path, e));
                failed += 1;
            }
        }
    }

    CopyResult {
        total,
        succeeded,
        failed,
        errors,
    }
}

/// Delete a list of files given their absolute paths.
pub fn delete_file_list(paths: &[String]) -> CopyResult {
    let total = paths.len();
    let mut succeeded = 0;
    let mut failed = 0;
    let mut errors = Vec::new();

    for path_str in paths {
        let path = Path::new(path_str);
        if !path.exists() {
            succeeded += 1; // Already gone
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

    CopyResult {
        total,
        succeeded,
        failed,
        errors,
    }
}
