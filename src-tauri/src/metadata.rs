use lofty::config::WriteOptions;
use lofty::prelude::{Accessor, TagExt, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::ItemKey;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Emitter};

const AUDIO_EXT: &[&str] = &[
    "mp3", "flac", "m4a", "ogg", "opus", "wav", "aiff", "wma", "aac",
];

#[derive(Debug, Clone, Serialize)]
pub struct TrackMetadata {
    pub file_path: String,
    pub file_name: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub sort_artist: Option<String>,
    pub track: Option<u32>,
    pub track_total: Option<u32>,
    pub year: Option<u32>,
    pub genre: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MetadataUpdate {
    pub file_path: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub sort_artist: Option<String>,
    pub track: Option<u32>,
    pub track_total: Option<u32>,
    pub year: Option<u32>,
    pub genre: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MetadataScanProgress {
    pub total: usize,
    pub completed: usize,
    pub current_file: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct MetadataSaveResult {
    pub total: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub errors: Vec<String>,
}

// ── Helpers ──────────────────────────────────────────────────────

fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXT.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn collect_audio_files(dir: &Path, files: &mut Vec<std::path::PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    let mut dirs = Vec::new();

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.starts_with('.'))
            .unwrap_or(false)
        {
            continue;
        }
        if path.is_dir() {
            dirs.push(path);
        } else if is_audio(&path) {
            files.push(path);
        }
    }

    dirs.sort();
    for d in dirs {
        collect_audio_files(&d, files);
    }
}

fn read_track(path: &Path) -> TrackMetadata {
    let file_path = path.to_string_lossy().to_string();
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let probe = match Probe::open(path) {
        Ok(p) => p,
        Err(_) => return empty_track(file_path, file_name),
    };
    let tagged = match probe.read() {
        Ok(t) => t,
        Err(_) => return empty_track(file_path, file_name),
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
        track: tag.track(),
        track_total: tag.track_total(),
        year: tag.year(),
        genre: tag.genre().map(|s| s.to_string()),
    }
}

fn empty_track(file_path: String, file_name: String) -> TrackMetadata {
    TrackMetadata {
        file_path,
        file_name,
        title: None,
        artist: None,
        album: None,
        album_artist: None,
        sort_artist: None,
        track: None,
        track_total: None,
        year: None,
        genre: None,
    }
}

// ── Scan ─────────────────────────────────────────────────────────

pub fn scan_metadata(path: &str, app: AppHandle) -> Result<Vec<TrackMetadata>, String> {
    let root = Path::new(path);
    if !root.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let mut audio_files = Vec::new();
    collect_audio_files(root, &mut audio_files);

    let total = audio_files.len();
    let mut tracks = Vec::with_capacity(total);

    for (i, file_path) in audio_files.iter().enumerate() {
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

// ── Save ─────────────────────────────────────────────────────────

pub fn save_metadata(updates: Vec<MetadataUpdate>) -> MetadataSaveResult {
    let total = updates.len();
    let mut succeeded = 0;
    let mut failed = 0;
    let mut errors = Vec::new();

    for update in &updates {
        match apply_update(update) {
            Ok(()) => succeeded += 1,
            Err(e) => {
                let file_name = Path::new(&update.file_path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or(&update.file_path);
                errors.push(format!("{}: {}", file_name, e));
                failed += 1;
            }
        }
    }

    MetadataSaveResult {
        total,
        succeeded,
        failed,
        errors,
    }
}

fn apply_update(update: &MetadataUpdate) -> Result<(), String> {
    let path = Path::new(&update.file_path);
    if !path.exists() {
        return Err("File not found".to_string());
    }

    let mut tagged = Probe::open(path)
        .map_err(|e| format!("Open failed: {}", e))?
        .read()
        .map_err(|e| format!("Read failed: {}", e))?;

    // Get or create a mutable tag
    let tag = if let Some(t) = tagged.primary_tag_mut() {
        t
    } else {
        let tag_type = tagged.primary_tag_type();
        tagged.insert_tag(lofty::tag::Tag::new(tag_type));
        tagged.primary_tag_mut().ok_or("Failed to create tag")?
    };

    // Accessor trait fields
    if let Some(ref v) = update.title {
        tag.set_title(v.to_string());
    }
    if let Some(ref v) = update.artist {
        tag.set_artist(v.to_string());
    }
    if let Some(ref v) = update.album {
        tag.set_album(v.to_string());
    }
    if let Some(ref v) = update.genre {
        tag.set_genre(v.to_string());
    }
    if let Some(v) = update.year {
        tag.set_year(v);
    }
    if let Some(v) = update.track {
        tag.set_track(v);
    }
    if let Some(v) = update.track_total {
        tag.set_track_total(v);
    }

    // ItemKey-based fields (not on Accessor trait)
    if let Some(ref v) = update.album_artist {
        tag.insert_text(ItemKey::AlbumArtist, v.to_string());
    }
    if let Some(ref v) = update.sort_artist {
        tag.insert_text(ItemKey::TrackArtistSortOrder, v.to_string());
    }

    tag.save_to_path(path, WriteOptions::default())
        .map_err(|e| format!("Save failed: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_audio_recognizes_formats() {
        assert!(is_audio(Path::new("song.mp3")));
        assert!(is_audio(Path::new("song.FLAC")));
        assert!(is_audio(Path::new("song.m4a")));
        assert!(!is_audio(Path::new("cover.jpg")));
        assert!(!is_audio(Path::new("notes.txt")));
    }

    #[test]
    fn empty_track_has_no_metadata() {
        let t = empty_track("/a/b.mp3".to_string(), "b.mp3".to_string());
        assert_eq!(t.file_path, "/a/b.mp3");
        assert!(t.title.is_none());
        assert!(t.artist.is_none());
    }
}
