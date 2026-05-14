use crate::audio_utils::{collect_audio_files, is_audio};
use crate::ffprobe_meta;
use lofty::prelude::{Accessor, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::ItemKey;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

use super::{MetadataScanProgress, TrackMetadata};

pub fn read_track(path: &Path) -> TrackMetadata {
    let file_path = path.to_string_lossy().to_string();
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let tagged = Probe::open(path).ok().and_then(|p| p.read().ok());

    // If lofty can't parse the file, fall back to ffprobe
    let Some(tagged) = tagged else {
        if let Some(meta) = ffprobe_meta::read_metadata(path) {
            return TrackMetadata {
                file_path,
                file_name,
                title: meta.title,
                artist: meta.artist,
                album: meta.album,
                album_artist: meta.album_artist,
                sort_artist: meta.sort_artist,
                sort_album_artist: meta.sort_album_artist,
                track: meta.track,
                track_total: meta.track_total,
                year: meta.year,
                genre: meta.genre,
            };
        }
        return empty_track(file_path, file_name);
    };
    let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) else {
        return empty_track(file_path, file_name);
    };

    TrackMetadata {
        file_path,
        file_name,
        title: tag.title().map(|s| s.to_string()),
        artist: tag.artist().map(|s| s.to_string()),
        album: tag.album().map(|s| s.to_string()),
        album_artist: tag.get_string(&ItemKey::AlbumArtist).map(|s| s.to_string()),
        sort_artist: tag
            .get_string(&ItemKey::TrackArtistSortOrder)
            .map(|s| s.to_string()),
        sort_album_artist: tag
            .get_string(&ItemKey::AlbumArtistSortOrder)
            .map(|s| s.to_string()),
        track: tag.track(),
        track_total: tag.track_total(),
        year: tag.year(),
        genre: tag.genre().map(|s| s.to_string()),
    }
}

pub(super) fn empty_track(file_path: String, file_name: String) -> TrackMetadata {
    TrackMetadata {
        file_path,
        file_name,
        title: None,
        artist: None,
        album: None,
        album_artist: None,
        sort_artist: None,
        sort_album_artist: None,
        track: None,
        track_total: None,
        year: None,
        genre: None,
    }
}

/// Scan metadata from a list of file/directory paths.
pub fn scan_metadata_paths(
    paths: Vec<String>,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
) -> Result<Vec<TrackMetadata>, String> {
    let mut seen = std::collections::HashSet::new();
    let mut audio_files = Vec::new();

    for p in &paths {
        let path = Path::new(p);
        if !path.exists() {
            continue;
        }
        if path.is_dir() {
            collect_audio_files(path, &mut audio_files);
        } else if is_audio(path) {
            audio_files.push(path.to_path_buf());
        }
    }

    // Deduplicate (a dir and its child file could both be dropped)
    audio_files.retain(|f| seen.insert(f.clone()));
    audio_files.sort();

    scan_files(&audio_files, &app, &cancel_flag)
}

/// Scan metadata from a single directory path.
pub fn scan_metadata(
    path: &str,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
) -> Result<Vec<TrackMetadata>, String> {
    let root = Path::new(path);
    if !root.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let mut audio_files = Vec::new();
    collect_audio_files(root, &mut audio_files);

    scan_files(&audio_files, &app, &cancel_flag)
}

/// Shared scan loop: read metadata from a list of audio file paths with
/// progress emission and cancellation support.
fn scan_files(
    audio_files: &[std::path::PathBuf],
    app: &AppHandle,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<Vec<TrackMetadata>, String> {
    let total = audio_files.len();
    let mut tracks = Vec::with_capacity(total);

    for (i, file_path) in audio_files.iter().enumerate() {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err("Cancelled".to_string());
        }

        let file_name = file_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let _ = app.emit(
            "metadata-scan-progress",
            MetadataScanProgress {
                total,
                completed: i,
                current_file: file_name,
            },
        );

        tracks.push(read_track(file_path));
    }

    Ok(tracks)
}
