use rusqlite::{params, Connection};
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use super::import::compute_library_dest;
use super::scan::{read_track_for_library, upsert_track};

const COVER_NAMES: &[&str] = &[
    "cover.jpg",
    "cover.jpeg",
    "cover.png",
    "cover.bmp",
    "folder.jpg",
    "folder.jpeg",
    "album.jpg",
    "album.jpeg",
    "front.jpg",
    "front.jpeg",
];

/// Move cover art files from old album folder to new one.
/// Only moves if the destination doesn't already have that file.
pub(crate) fn migrate_cover_art(old_dir: &Path, new_dir: &Path) {
    let entries = match fs::read_dir(old_dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.filter_map(|e| e.ok()) {
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if COVER_NAMES.contains(&name.as_str()) {
            let dest = new_dir.join(entry.file_name());
            if !dest.exists() {
                let _ = fs::rename(entry.path(), dest);
            }
        }
    }
}

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

    // Update the existing record in place (preserving its id) rather than
    // DELETE + INSERT which would generate a new id and break frontend selection.
    conn.execute(
        "UPDATE tracks SET
            file_path=?1, file_name=?2, folder_path=?3, title=?4, artist=?5,
            album=?6, album_artist=?7, sort_artist=?8, sort_album_artist=?9,
            track_number=?10, track_total=?11, disc_number=?12, disc_total=?13,
            year=?14, genre=?15, duration_secs=?16, sample_rate=?17,
            bitrate_kbps=?18, format=?19, file_size=?20, modified_at=?21, scanned_at=?22
        WHERE file_path = ?23",
        params![
            track_data.file_path,
            track_data.file_name,
            track_data.folder_path,
            track_data.title,
            track_data.artist,
            track_data.album,
            track_data.album_artist,
            track_data.sort_artist,
            track_data.sort_album_artist,
            track_data.track_number,
            track_data.track_total,
            track_data.disc_number,
            track_data.disc_total,
            track_data.year,
            track_data.genre,
            track_data.duration_secs,
            track_data.sample_rate,
            track_data.bitrate_kbps,
            track_data.format,
            track_data.file_size as i64,
            mtime,
            now,
            file_path,
        ],
    )
    .map_err(|e| format!("Failed to update track: {}", e))?;

    // Move cover art from old folder to new folder if they differ
    let old_parent = src.parent();
    let new_parent = dest.parent();
    if let (Some(old_dir), Some(new_dir)) = (old_parent, new_parent) {
        if old_dir != new_dir {
            migrate_cover_art(old_dir, new_dir);
        }
    }

    if let Some(old_dir) = old_parent {
        cleanup_empty_dirs(old_dir, root);
    }

    Ok(Some(new_path))
}
