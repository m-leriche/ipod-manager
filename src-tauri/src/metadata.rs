use crate::audio_utils::{collect_audio_files, is_audio};
use id3::TagLike;
use lofty::config::WriteOptions;
use lofty::prelude::{Accessor, TagExt, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::ItemKey;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackMetadata {
    pub file_path: String,
    pub file_name: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub sort_artist: Option<String>,
    pub sort_album_artist: Option<String>,
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
    pub sort_album_artist: Option<String>,
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
pub struct MetadataSaveProgress {
    pub total: usize,
    pub completed: usize,
    pub current_file: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct MetadataSaveResult {
    pub total: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub cancelled: bool,
    pub errors: Vec<String>,
}

// ── Helpers ──────────────────────────────────────────────────────

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
        sort_album_artist: tag
            .get_string(&ItemKey::AlbumArtistSortOrder)
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
        sort_album_artist: None,
        track: None,
        track_total: None,
        year: None,
        genre: None,
    }
}

// ── Scan ─────────────────────────────────────────────────────────

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

// ── Save ─────────────────────────────────────────────────────────

pub fn save_metadata(
    updates: Vec<MetadataUpdate>,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
) -> MetadataSaveResult {
    let total = updates.len();
    let mut succeeded = 0;
    let mut failed = 0;
    let mut errors = Vec::new();

    for (i, update) in updates.iter().enumerate() {
        if cancel_flag.load(Ordering::SeqCst) {
            return MetadataSaveResult {
                total,
                succeeded,
                failed,
                cancelled: true,
                errors,
            };
        }

        let file_name = Path::new(&update.file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&update.file_path)
            .to_string();

        let _ = app.emit(
            "metadata-save-progress",
            MetadataSaveProgress {
                total,
                completed: i,
                current_file: file_name.clone(),
            },
        );

        match apply_update(update) {
            Ok(()) => succeeded += 1,
            Err(e) => {
                errors.push(format!("{}: {}", file_name, e));
                failed += 1;
            }
        }
    }

    MetadataSaveResult {
        total,
        succeeded,
        failed,
        cancelled: false,
        errors,
    }
}

fn apply_update(update: &MetadataUpdate) -> Result<(), String> {
    let path = Path::new(&update.file_path);
    if !path.exists() {
        return Err("File not found".to_string());
    }

    let is_mp3 = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("mp3"))
        .unwrap_or(false);

    if is_mp3 {
        apply_update_id3(path, update)
    } else {
        apply_update_lofty(path, update)
    }
}

/// Write MP3 tags via the id3 crate, which handles non-standard MP3 headers
/// that lofty's re-probe rejects during save.
fn apply_update_id3(path: &Path, update: &MetadataUpdate) -> Result<(), String> {
    let mut tag = id3::Tag::read_from_path(path).unwrap_or_else(|_| id3::Tag::new());

    if let Some(ref v) = update.title {
        tag.set_title(v.as_str());
    }
    if let Some(ref v) = update.artist {
        tag.set_artist(v.as_str());
    }
    if let Some(ref v) = update.album {
        tag.set_album(v.as_str());
    }
    if let Some(ref v) = update.genre {
        tag.set_genre(v.as_str());
    }
    if let Some(v) = update.year {
        tag.set_year(v as i32);
    }
    if let Some(v) = update.track {
        tag.set_track(v);
    }
    if let Some(v) = update.track_total {
        tag.set_total_tracks(v);
    }
    if let Some(ref v) = update.album_artist {
        tag.set_album_artist(v.as_str());
    }
    if let Some(ref v) = update.sort_artist {
        tag.add_frame(id3::frame::Frame::text("TSOP", v.as_str()));
    }
    if let Some(ref v) = update.sort_album_artist {
        tag.add_frame(id3::frame::Frame::text("TSO2", v.as_str()));
    }

    tag.write_to_path(path, id3::Version::Id3v24)
        .map_err(|e| format!("Save failed: {}", e))?;

    Ok(())
}

/// Write tags for non-MP3 formats via lofty.
fn apply_update_lofty(path: &Path, update: &MetadataUpdate) -> Result<(), String> {
    let mut tagged = Probe::open(path)
        .map_err(|e| format!("Open failed: {}", e))?
        .read()
        .map_err(|e| format!("Read failed: {}", e))?;

    let tag = if let Some(t) = tagged.primary_tag_mut() {
        t
    } else {
        let tag_type = tagged.primary_tag_type();
        tagged.insert_tag(lofty::tag::Tag::new(tag_type));
        tagged.primary_tag_mut().ok_or("Failed to create tag")?
    };

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
    if let Some(ref v) = update.album_artist {
        tag.insert_text(ItemKey::AlbumArtist, v.to_string());
    }
    if let Some(ref v) = update.sort_artist {
        tag.insert_text(ItemKey::TrackArtistSortOrder, v.to_string());
    }
    if let Some(ref v) = update.sort_album_artist {
        tag.insert_text(ItemKey::AlbumArtistSortOrder, v.to_string());
    }

    tag.save_to_path(path, WriteOptions::default())
        .map_err(|e| format!("Save failed: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_track_has_no_metadata() {
        let t = empty_track("/a/b.mp3".to_string(), "b.mp3".to_string());
        assert_eq!(t.file_path, "/a/b.mp3");
        assert!(t.title.is_none());
        assert!(t.artist.is_none());
    }
}
