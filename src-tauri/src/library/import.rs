use crate::audio_utils;
use rusqlite::Connection;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

use super::folders::add_folder;
use super::scan::{read_track_for_library, scan_folder};
use super::types::{ImportProgress, ImportResult, TrackData};

pub fn sanitize_path_component(name: &str) -> String {
    let sanitized: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect();
    let trimmed = sanitized.trim().trim_end_matches('.').trim().to_string();
    if trimmed.is_empty() {
        return "Unknown".to_string();
    }
    if trimmed.len() > 255 {
        trimmed[..255].to_string()
    } else {
        trimmed
    }
}

fn compute_library_filename(track: &TrackData) -> String {
    let ext = Path::new(&track.file_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("flac");

    let title = match track.title.as_deref() {
        Some(t) if !t.is_empty() => t,
        _ => return track.file_name.clone(),
    };
    let track_num = match track.track_number {
        Some(n) if n > 0 => n,
        _ => return track.file_name.clone(),
    };

    let disc = track.disc_number.unwrap_or(1);
    let sanitized_title = sanitize_path_component(title);
    format!("{:02}-{:02} {}.{}", disc, track_num, sanitized_title, ext)
}

pub(super) fn compute_library_dest(library_root: &Path, track: &TrackData) -> PathBuf {
    let artist_name = track
        .album_artist
        .as_deref()
        .or(track.artist.as_deref())
        .unwrap_or("Unknown Artist");
    let album_name = track.album.as_deref().unwrap_or("Unknown Album");

    library_root
        .join(sanitize_path_component(artist_name))
        .join(sanitize_path_component(album_name))
        .join(compute_library_filename(track))
}

pub fn import_to_library(
    library_root: &str,
    source_paths: &[String],
    conn: &Connection,
    app: &AppHandle,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<ImportResult, String> {
    let root = Path::new(library_root);

    let mut audio_files: Vec<PathBuf> = Vec::new();
    for path_str in source_paths {
        let path = Path::new(path_str);
        if path.is_dir() {
            audio_utils::collect_audio_files(path, &mut audio_files);
        } else if path.is_file() && audio_utils::is_audio(path) {
            audio_files.push(path.to_path_buf());
        }
    }

    let total = audio_files.len();
    let mut copied = 0;
    let mut skipped = 0;
    let mut errors = Vec::new();

    for (i, src_path) in audio_files.iter().enumerate() {
        if cancel_flag.load(Ordering::SeqCst) {
            return Ok(ImportResult {
                total_files: total,
                copied,
                skipped,
                errors,
            });
        }

        let file_name = src_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let _ = app.emit(
            "import-progress",
            ImportProgress {
                total,
                completed: i,
                current_file: file_name.clone(),
            },
        );

        let track_data = match read_track_for_library(src_path) {
            Some(td) => td,
            None => {
                errors.push(format!("{}: Failed to read metadata", file_name));
                continue;
            }
        };

        let dest_path = compute_library_dest(root, &track_data);

        if dest_path.exists() {
            skipped += 1;
            continue;
        }

        if let Some(parent) = dest_path.parent() {
            if let Err(e) = fs::create_dir_all(parent) {
                errors.push(format!("{}: Failed to create directory: {}", file_name, e));
                continue;
            }
        }

        match fs::copy(src_path, &dest_path) {
            Ok(_) => copied += 1,
            Err(e) => {
                errors.push(format!("{}: Copy failed: {}", file_name, e));
            }
        }
    }

    let _ = app.emit(
        "import-progress",
        ImportProgress {
            total,
            completed: total,
            current_file: String::new(),
        },
    );

    add_folder(conn, library_root)?;
    scan_folder(conn, library_root, app, cancel_flag)?;

    Ok(ImportResult {
        total_files: total,
        copied,
        skipped,
        errors,
    })
}
