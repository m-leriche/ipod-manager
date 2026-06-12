use rusqlite::Connection;
use std::path::{Path, PathBuf};

use crate::audio_utils::is_audio;
use crate::library::read_track_for_library;
use crate::library::types::TrackData;

use super::checks;
use super::types::{AlbumChecks, InboxAlbum, InboxTrack};

pub fn scan_inbox(root: &str, conn: &Connection) -> Result<Vec<InboxAlbum>, String> {
    let root = Path::new(root);
    if !root.is_dir() {
        return Err(format!("Inbox folder not found: {}", root.display()));
    }

    let mut folders = Vec::new();
    collect_album_folders(root, &mut folders);

    let mut albums: Vec<InboxAlbum> = folders.iter().map(|f| read_album(f, conn)).collect();
    albums.sort_by(|a, b| {
        a.folder_name
            .to_lowercase()
            .cmp(&b.folder_name.to_lowercase())
    });
    Ok(albums)
}

/// An album is any directory directly containing audio files.
fn collect_album_folders(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };

    let mut has_audio = false;
    let mut subdirs = Vec::new();
    for entry in entries.filter_map(|e| e.ok()) {
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            subdirs.push(path);
        } else if is_audio(&path) {
            has_audio = true;
        }
    }

    if has_audio {
        out.push(dir.to_path_buf());
    }
    subdirs.sort();
    for sub in subdirs {
        collect_album_folders(&sub, out);
    }
}

pub(super) fn direct_audio_children(folder: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(folder) else {
        return Vec::new();
    };
    let mut paths: Vec<PathBuf> = entries
        .filter_map(|e| e.ok())
        .filter(|e| !e.file_name().to_string_lossy().starts_with('.'))
        .map(|e| e.path())
        .filter(|p| p.is_file() && is_audio(p))
        .collect();
    paths.sort();
    paths
}

fn read_album(folder: &Path, conn: &Connection) -> InboxAlbum {
    let paths = direct_audio_children(folder);
    let mut data: Vec<TrackData> = paths.iter().map(|p| read_track_for_library(p)).collect();
    data.sort_by_key(|t| {
        (
            t.disc_number.unwrap_or(1),
            t.track_number.unwrap_or(u32::MAX),
            t.file_name.clone(),
        )
    });

    let artist = data
        .iter()
        .find_map(|t| t.album_artist.clone().or_else(|| t.artist.clone()));
    let album = data.iter().find_map(|t| t.album.clone());
    let year = data.iter().find_map(|t| t.year);

    let checks = AlbumChecks {
        tags: checks::check_tags(&data),
        cover: checks::check_cover(folder, &paths),
        tracklist: checks::local_tracklist(&data),
        duplicate: checks::check_duplicate(conn, artist.as_deref(), album.as_deref(), &data),
    };

    InboxAlbum {
        folder_path: folder.to_string_lossy().to_string(),
        folder_name: folder
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default(),
        artist,
        album,
        year,
        tracks: data.into_iter().map(to_inbox_track).collect(),
        checks,
    }
}

fn to_inbox_track(t: TrackData) -> InboxTrack {
    InboxTrack {
        file_path: t.file_path,
        file_name: t.file_name,
        title: t.title,
        track_number: t.track_number,
        duration_secs: t.duration_secs,
        format: t.format,
        bitrate_kbps: t.bitrate_kbps,
    }
}
