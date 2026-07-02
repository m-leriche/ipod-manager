use rusqlite::{params, Connection};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::albumart;
use crate::audio_utils::normalize_path;
use crate::files::copy::verify_copy_size;
use crate::library::{compute_library_dest, read_track_for_library, upsert_track};

use super::scan::direct_audio_children;
use super::tags::strip_import_tags;
use super::types::{FileAwayResult, FileMove};

/// Move an inbox album's audio files (and cover, if any) into the library,
/// upserting moved tracks into the database. Returns the moves performed so
/// the caller can undo them.
pub fn file_album(
    library_root: &str,
    folder: &str,
    conn: &Connection,
) -> Result<FileAwayResult, String> {
    let folder = Path::new(folder);
    let root = Path::new(library_root);

    let audio = direct_audio_children(folder);
    if audio.is_empty() {
        return Err(format!("No audio files in {}", folder.display()));
    }

    let now = epoch_secs();
    let mut moves = Vec::new();
    let mut errors = Vec::new();
    let mut dest_dir: Option<PathBuf> = None;

    for src in &audio {
        // Strip Sort Artist / Album Artist tags and clear the compilation flag
        // before reading metadata, so the destination folder is computed from
        // the remaining Artist field rather than the album artist we removed.
        if let Err(e) = strip_import_tags(src) {
            let name = src
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            errors.push(format!("{}: tag cleanup failed: {}", name, e));
        }

        let mut track = read_track_for_library(src);
        let dest = compute_library_dest(root, &track);

        if dest.exists() {
            errors.push(format!("{}: already exists in library", track.file_name));
            continue;
        }
        if let Err(e) = move_file(src, &dest) {
            errors.push(format!("{}: {}", track.file_name, e));
            continue;
        }

        let normalized = normalize_path(&dest);
        track.file_path = normalized.to_string_lossy().to_string();
        track.folder_path = normalized
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let mtime = fs::metadata(&dest)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        if let Err(e) = upsert_track(conn, &track, mtime, now) {
            errors.push(format!("{}: DB update failed: {}", track.file_name, e));
        }

        dest_dir.get_or_insert_with(|| dest.parent().unwrap_or(root).to_path_buf());
        moves.push(FileMove {
            from: src.to_string_lossy().to_string(),
            // NFC-normalized to match the upserted row — undo deletes by
            // exact string equality on this path.
            to: track.file_path.clone(),
            is_audio: true,
        });
    }

    if let (Some(dest_dir), Some(cover)) = (&dest_dir, albumart::find_cover(folder)) {
        let dest = dest_dir.join(cover.file_name().unwrap_or_default());
        if !dest.exists() {
            match move_file(&cover, &dest) {
                Ok(()) => moves.push(FileMove {
                    from: cover.to_string_lossy().to_string(),
                    to: dest.to_string_lossy().to_string(),
                    is_audio: false,
                }),
                Err(e) => errors.push(format!("Cover: {}", e)),
            }
        }
    }

    Ok(FileAwayResult { moves, errors })
}

/// Delete an inbox folder after its album was filed away, along with any
/// leftover files (lyrics, .txt, etc.). Called only once the user confirms.
/// If any audio remains (already in the library, or a move error), the folder
/// is kept intact so un-imported audio is never destroyed — that's a success,
/// not a failure. A genuine filesystem error (e.g. permissions) propagates so
/// the caller can surface it.
pub fn delete_filed_folder(folder: &str) -> Result<(), String> {
    let folder = Path::new(folder);
    if !direct_audio_children(folder).is_empty() {
        return Ok(());
    }
    fs::remove_dir_all(folder).map_err(|e| format!("{}: {}", folder.display(), e))
}

/// Reverse a set of moves: restore files to the inbox, remove the tracks from
/// the database, and prune emptied library folders.
pub fn undo_filing(moves: &[FileMove], conn: &Connection) -> Result<(), String> {
    let mut errors = Vec::new();

    for m in moves.iter().rev() {
        let from = Path::new(&m.to);
        let to = Path::new(&m.from);

        if let Err(e) = move_file(from, to) {
            errors.push(format!("{}: {}", m.to, e));
            continue;
        }
        if m.is_audio {
            let _ = conn.execute("DELETE FROM tracks WHERE file_path = ?1", params![m.to]);
        }
        // Prune the album folder, then the artist folder, if emptied
        if let Some(album_dir) = from.parent() {
            if fs::remove_dir(album_dir).is_ok() {
                if let Some(artist_dir) = album_dir.parent() {
                    let _ = fs::remove_dir(artist_dir);
                }
            }
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(format!("Undo incomplete: {}", errors.join("; ")))
    }
}

pub(super) fn move_file(from: &Path, to: &Path) -> Result<(), String> {
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Create dir failed: {}", e))?;
    }
    if fs::rename(from, to).is_ok() {
        return Ok(());
    }
    // Cross-device move: copy, verify size, then remove
    fs::copy(from, to).map_err(|e| format!("Copy failed: {}", e))?;
    if let Err(msg) = verify_copy_size(from, to) {
        let _ = fs::remove_file(to);
        return Err(msg);
    }
    fs::remove_file(from).map_err(|e| format!("Remove failed: {}", e))
}

fn epoch_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
