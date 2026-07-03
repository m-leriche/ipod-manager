use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::UNIX_EPOCH;

use super::transcode::{is_lossless, mp3_dest_path};
use super::types::CompareEntry;

/// FAT32 stores mtimes with 2-second resolution, and in local time — so when
/// a comparison straddles a daylight-saving change the same file's mtime reads
/// back exactly one hour off. Treat mtimes as equal when they are within 2s of
/// each other, or within 2s of a one-hour DST shift in either direction.
///
/// The tolerance is capped at a single hour on purpose: DST is always a 1-hour
/// rule, so anything further apart is a genuine change, not a clock artifact.
pub(crate) fn mtimes_match(a: u64, b: u64) -> bool {
    const FAT_RESOLUTION_SECS: u64 = 2;
    const DST_SHIFT_SECS: u64 = 3600;
    let delta = a.abs_diff(b);
    delta <= FAT_RESOLUTION_SECS || delta.abs_diff(DST_SHIFT_SECS) <= FAT_RESOLUTION_SECS
}

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
    if cancel_flag.load(Ordering::SeqCst) {
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
    transcode_lossless: bool,
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

    let mut results = pair_entries(&source_files, &target_files, transcode_lossless);

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

/// Pair source files against target files by relative path.
///
/// With `transcode_lossless` on, a lossless source pairs with the target path
/// whose extension is replaced by `.mp3`. Transcoded pairs never size-compare
/// (sizes differ by design): the pair is "same" when the mp3 exists and is not
/// older than the source, "modified" when it is older, "source_only" when the
/// mp3 is missing. Non-lossless files keep the existing size-based semantics.
pub(super) fn pair_entries(
    source_files: &HashMap<String, (u64, u64)>,
    target_files: &HashMap<String, (u64, u64)>,
    transcode_lossless: bool,
) -> Vec<CompareEntry> {
    let mut results: Vec<CompareEntry> = Vec::new();
    let mut consumed_targets: HashSet<String> = HashSet::new();

    for (rel_path, (src_size, src_mod)) in source_files {
        let transcoded = transcode_lossless && is_lossless(rel_path);
        let target_key = if transcoded {
            mp3_dest_path(rel_path)
        } else {
            rel_path.clone()
        };

        if let Some((tgt_size, tgt_mod)) = target_files.get(&target_key) {
            let is_same = if transcoded {
                tgt_mod >= src_mod
            } else {
                src_size == tgt_size && mtimes_match(*src_mod, *tgt_mod)
            };
            results.push(CompareEntry {
                relative_path: rel_path.clone(),
                is_dir: false,
                source_size: Some(*src_size),
                target_size: Some(*tgt_size),
                source_modified: Some(*src_mod),
                target_modified: Some(*tgt_mod),
                status: if is_same { "same" } else { "modified" }.to_string(),
                transcoded,
            });
            if transcoded {
                consumed_targets.insert(target_key);
            }
        } else {
            results.push(CompareEntry {
                relative_path: rel_path.clone(),
                is_dir: false,
                source_size: Some(*src_size),
                target_size: None,
                source_modified: Some(*src_mod),
                target_modified: None,
                status: "source_only".to_string(),
                transcoded,
            });
        }
    }

    for (rel_path, (tgt_size, tgt_mod)) in target_files {
        // A lossless source no longer claims its same-extension target when
        // transcoding — it pairs with the .mp3 instead.
        let matched_by_source =
            source_files.contains_key(rel_path) && !(transcode_lossless && is_lossless(rel_path));
        if matched_by_source || consumed_targets.contains(rel_path) {
            continue;
        }
        results.push(CompareEntry {
            relative_path: rel_path.clone(),
            is_dir: false,
            source_size: None,
            target_size: Some(*tgt_size),
            source_modified: None,
            target_modified: Some(*tgt_mod),
            status: "target_only".to_string(),
            transcoded: false,
        });
    }

    results
}
