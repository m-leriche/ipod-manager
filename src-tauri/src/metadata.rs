use crate::audio_utils::{collect_audio_files, is_audio};
use crate::ffprobe_meta;
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
    pub disc_number: Option<u32>,
    pub disc_total: Option<u32>,
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

    let tagged = Probe::open(path).ok().and_then(|p| p.read().ok());

    // If lofty can't parse the file, fall back to ffprobe
    if tagged.is_none() {
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
    }

    let tagged = tagged.expect("checked above");
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
        return apply_update_id3(path, update);
    }

    // Try lofty first; if it can't open the file, fall back to ffmpeg
    match apply_update_lofty(path, update) {
        Ok(()) => Ok(()),
        Err(_) => apply_update_ffmpeg(path, update),
    }
}

/// Write tags via ffmpeg for files that lofty cannot parse.
fn apply_update_ffmpeg(path: &Path, update: &MetadataUpdate) -> Result<(), String> {
    // First read existing metadata so we preserve fields not being updated
    let existing = ffprobe_meta::read_metadata(path);

    let mut tags: Vec<(&str, String)> = Vec::new();

    // For each field: use the update value if provided, otherwise preserve existing
    let resolve = |update_val: &Option<String>, existing_val: Option<String>| -> String {
        match update_val {
            Some(v) => v.clone(),
            None => existing_val.unwrap_or_default(),
        }
    };

    let ex = &existing;

    tags.push((
        "title",
        resolve(&update.title, ex.as_ref().and_then(|m| m.title.clone())),
    ));
    tags.push((
        "artist",
        resolve(&update.artist, ex.as_ref().and_then(|m| m.artist.clone())),
    ));
    tags.push((
        "album",
        resolve(&update.album, ex.as_ref().and_then(|m| m.album.clone())),
    ));
    tags.push((
        "album_artist",
        resolve(
            &update.album_artist,
            ex.as_ref().and_then(|m| m.album_artist.clone()),
        ),
    ));
    tags.push((
        "genre",
        resolve(&update.genre, ex.as_ref().and_then(|m| m.genre.clone())),
    ));
    tags.push((
        "sort_artist",
        resolve(
            &update.sort_artist,
            ex.as_ref().and_then(|m| m.sort_artist.clone()),
        ),
    ));
    tags.push((
        "sort_album_artist",
        resolve(
            &update.sort_album_artist,
            ex.as_ref().and_then(|m| m.sort_album_artist.clone()),
        ),
    ));

    // Track/disc as "N/Total" format
    let track_str = format_number_pair(
        update.track.or(ex.as_ref().and_then(|m| m.track)),
        update
            .track_total
            .or(ex.as_ref().and_then(|m| m.track_total)),
    );
    tags.push(("track", track_str));

    let disc_str = format_number_pair(
        update.disc_number.or(ex.as_ref().and_then(|m| m.disc)),
        update.disc_total.or(ex.as_ref().and_then(|m| m.disc_total)),
    );
    tags.push(("disc", disc_str));

    let year_val = update
        .year
        .or(ex.as_ref().and_then(|m| m.year))
        .map(|y| y.to_string())
        .unwrap_or_default();
    tags.push(("date", year_val));

    let tag_refs: Vec<(&str, &str)> = tags.iter().map(|(k, v)| (*k, v.as_str())).collect();
    ffprobe_meta::write_metadata(path, &tag_refs)
}

fn format_number_pair(num: Option<u32>, total: Option<u32>) -> String {
    match (num, total) {
        (Some(n), Some(t)) => format!("{}/{}", n, t),
        (Some(n), None) => n.to_string(),
        _ => String::new(),
    }
}

/// Write MP3 tags via the id3 crate, which handles non-standard MP3 headers
/// that lofty's re-probe rejects during save.
fn apply_update_id3(path: &Path, update: &MetadataUpdate) -> Result<(), String> {
    let mut tag = id3::Tag::read_from_path(path).unwrap_or_else(|_| id3::Tag::new());

    if let Some(ref v) = update.title {
        if v.is_empty() {
            tag.remove_title();
        } else {
            tag.set_title(v.as_str());
        }
    }
    if let Some(ref v) = update.artist {
        if v.is_empty() {
            tag.remove_artist();
        } else {
            tag.set_artist(v.as_str());
        }
    }
    if let Some(ref v) = update.album {
        if v.is_empty() {
            tag.remove_album();
        } else {
            tag.set_album(v.as_str());
        }
    }
    if let Some(ref v) = update.genre {
        if v.is_empty() {
            tag.remove_genre();
        } else {
            tag.set_genre(v.as_str());
        }
    }
    if let Some(v) = update.year {
        // Use set_date_recorded (TDRC) instead of set_year (TYER) so that
        // lofty can read the year back — lofty only checks the TDRC frame.
        tag.set_date_recorded(id3::Timestamp {
            year: v as i32,
            month: None,
            day: None,
            hour: None,
            minute: None,
            second: None,
        });
    }
    if let Some(v) = update.track {
        tag.set_track(v);
    }
    if let Some(v) = update.track_total {
        tag.set_total_tracks(v);
    }
    if let Some(v) = update.disc_number {
        tag.set_disc(v);
    }
    if let Some(v) = update.disc_total {
        tag.set_total_discs(v);
    }
    if let Some(ref v) = update.album_artist {
        if v.is_empty() {
            tag.remove_album_artist();
        } else {
            tag.set_album_artist(v.as_str());
        }
    }
    if let Some(ref v) = update.sort_artist {
        if v.is_empty() {
            tag.remove("TSOP");
        } else {
            tag.add_frame(id3::frame::Frame::text("TSOP", v.as_str()));
        }
    }
    if let Some(ref v) = update.sort_album_artist {
        if v.is_empty() {
            tag.remove("TSO2");
        } else {
            tag.add_frame(id3::frame::Frame::text("TSO2", v.as_str()));
        }
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
        if v.is_empty() {
            tag.remove_title();
        } else {
            tag.set_title(v.to_string());
        }
    }
    if let Some(ref v) = update.artist {
        if v.is_empty() {
            tag.remove_artist();
        } else {
            tag.set_artist(v.to_string());
        }
    }
    if let Some(ref v) = update.album {
        if v.is_empty() {
            tag.remove_album();
        } else {
            tag.set_album(v.to_string());
        }
    }
    if let Some(ref v) = update.genre {
        if v.is_empty() {
            tag.remove_genre();
        } else {
            tag.set_genre(v.to_string());
        }
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
    if let Some(v) = update.disc_number {
        tag.set_disk(v);
    }
    if let Some(v) = update.disc_total {
        tag.set_disk_total(v);
    }
    if let Some(ref v) = update.album_artist {
        if v.is_empty() {
            tag.remove_key(&ItemKey::AlbumArtist);
        } else {
            tag.insert_text(ItemKey::AlbumArtist, v.to_string());
        }
    }
    if let Some(ref v) = update.sort_artist {
        if v.is_empty() {
            tag.remove_key(&ItemKey::TrackArtistSortOrder);
        } else {
            tag.insert_text(ItemKey::TrackArtistSortOrder, v.to_string());
        }
    }
    if let Some(ref v) = update.sort_album_artist {
        if v.is_empty() {
            tag.remove_key(&ItemKey::AlbumArtistSortOrder);
        } else {
            tag.insert_text(ItemKey::AlbumArtistSortOrder, v.to_string());
        }
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
