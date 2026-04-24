use rusqlite::{params, Connection};
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use super::import::compute_library_dest;
use super::scan::{read_track_for_library, upsert_track};

pub fn cleanup_empty_dirs(start: &Path, stop_at: &Path) {
    let mut current = start.to_path_buf();
    while current.starts_with(stop_at) && current != stop_at {
        let is_empty = fs::read_dir(&current)
            .map(|mut d| d.next().is_none())
            .unwrap_or(false);
        if !is_empty {
            break;
        }
        let _ = fs::remove_dir(&current);
        match current.parent() {
            Some(parent) => current = parent.to_path_buf(),
            None => break,
        }
    }
}

pub fn reorganize_library_file(
    conn: &Connection,
    library_root: &str,
    file_path: &str,
) -> Result<Option<String>, String> {
    let src = Path::new(file_path);
    if !src.exists() {
        return Ok(None);
    }

    let mut track_data = match read_track_for_library(src) {
        Some(td) => td,
        None => return Ok(None),
    };

    let root = Path::new(library_root);
    let dest = compute_library_dest(root, &track_data);

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let mtime = fs::metadata(src)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(now);

    if dest == src {
        upsert_track(conn, &track_data, mtime, now)?;
        return Ok(None);
    }

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    fs::rename(src, &dest).map_err(|e| format!("Failed to move file: {}", e))?;

    let new_path = dest.to_string_lossy().to_string();
    track_data.file_path = new_path.clone();
    track_data.file_name = dest
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    track_data.folder_path = dest
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let _ = conn.execute(
        "DELETE FROM tracks WHERE file_path = ?1",
        params![file_path],
    );
    upsert_track(conn, &track_data, mtime, now)?;

    if let Some(old_parent) = src.parent() {
        cleanup_empty_dirs(old_parent, root);
    }

    Ok(Some(new_path))
}
