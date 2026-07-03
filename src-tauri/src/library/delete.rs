use rusqlite::{params, Connection};
use std::collections::HashSet;
use std::path::Path;

use crate::files::trash_or_delete;

use super::reorganize::cleanup_empty_dirs;

pub fn delete_tracks(
    conn: &Connection,
    library_root: &str,
    track_ids: &[i64],
) -> Result<usize, String> {
    let root = Path::new(library_root);
    let mut deleted = 0;
    let mut affected_folders: HashSet<String> = HashSet::new();

    for id in track_ids {
        let (file_path, folder_path): (String, String) = conn
            .query_row(
                "SELECT file_path, folder_path FROM tracks WHERE id = ?1",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|e| format!("Track {} not found: {}", id, e))?;

        let path = Path::new(&file_path);
        if path.exists() {
            if let Err(e) = trash_or_delete(path) {
                // File may have been moved or deleted between the exists() check
                // and removal (TOCTOU), or the path resolves via macOS Unicode
                // normalization but the exact bytes don't match a real entry.
                // Either way, we still want to remove the DB record.
                log::warn!("Could not delete file {}: {}", file_path, e);
            }
        }

        conn.execute("DELETE FROM tracks WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to remove track from db: {}", e))?;

        affected_folders.insert(folder_path);
        deleted += 1;
    }

    // Clean up folders that no longer have any tracked audio files
    for folder in &affected_folders {
        let remaining: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM tracks WHERE folder_path = ?1",
                params![folder],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let folder_path = Path::new(folder);
        if remaining == 0 && folder_path.exists() && folder_path.starts_with(root) {
            // No tracks left — remove the entire album folder (cover art, etc.)
            let _ = trash_or_delete(folder_path);
            // Clean up empty parent (artist folder) if it's now empty
            if let Some(parent) = folder_path.parent() {
                cleanup_empty_dirs(parent, root);
            }
        } else {
            cleanup_empty_dirs(folder_path, root);
        }
    }

    Ok(deleted)
}
