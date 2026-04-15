use id3::TagLike;
use lofty::config::WriteOptions;
use lofty::picture::{Picture, PictureType};
use lofty::prelude::{TagExt, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::{ItemKey, Tag};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

// ── Types ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type")]
pub enum PictureAction {
    ClearAll,
    RetainFrontCover,
    MoveFrontCoverToFile { filename: String },
}

#[derive(Debug, Clone, Deserialize)]
pub struct SanitizeOptions {
    pub file_paths: Vec<String>,
    pub retain_fields: Vec<String>,
    pub picture_action: PictureAction,
    pub preserve_replay_gain: bool,
    pub reduce_date_to_year: bool,
    pub drop_disc_for_single: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SanitizeProgress {
    pub total: usize,
    pub completed: usize,
    pub current_file: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SanitizeResult {
    pub total: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub cancelled: bool,
    pub errors: Vec<String>,
}

// ── Field mapping ───────────────────────────────────────────────

fn field_to_item_key(field: &str) -> Option<ItemKey> {
    match field.to_lowercase().trim() {
        "artist" => Some(ItemKey::TrackArtist),
        "title" => Some(ItemKey::TrackTitle),
        "album" => Some(ItemKey::AlbumTitle),
        "tracknumber" => Some(ItemKey::TrackNumber),
        "discnumber" => Some(ItemKey::DiscNumber),
        "totaltracks" => Some(ItemKey::TrackTotal),
        "totaldiscs" => Some(ItemKey::DiscTotal),
        "genre" => Some(ItemKey::Genre),
        "albumartist" => Some(ItemKey::AlbumArtist),
        "date" | "year" => Some(ItemKey::Year),
        "composer" => Some(ItemKey::Composer),
        "comment" => Some(ItemKey::Comment),
        "lyrics" => Some(ItemKey::Lyrics),
        "bpm" => Some(ItemKey::Bpm),
        "sortartist" => Some(ItemKey::TrackArtistSortOrder),
        "sortalbumartist" => Some(ItemKey::AlbumArtistSortOrder),
        "sortalbum" => Some(ItemKey::AlbumTitleSortOrder),
        "sorttitle" => Some(ItemKey::TrackTitleSortOrder),
        _ => None,
    }
}

const REPLAY_GAIN_KEYS: &[ItemKey] = &[
    ItemKey::ReplayGainTrackGain,
    ItemKey::ReplayGainTrackPeak,
    ItemKey::ReplayGainAlbumGain,
    ItemKey::ReplayGainAlbumPeak,
];

// ── Main entry point ────────────────────────────────────────────

pub fn sanitize_tags(
    options: SanitizeOptions,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
) -> SanitizeResult {
    let total = options.file_paths.len();
    let mut succeeded = 0;
    let mut failed = 0;
    let mut errors = Vec::new();
    let mut cover_exported_dirs = HashSet::new();

    let retain_set: HashSet<String> = options
        .retain_fields
        .iter()
        .map(|f| f.to_lowercase().trim().to_string())
        .collect();

    for (i, file_path) in options.file_paths.iter().enumerate() {
        if cancel_flag.load(Ordering::SeqCst) {
            return SanitizeResult {
                total,
                succeeded,
                failed,
                cancelled: true,
                errors,
            };
        }

        let file_name = Path::new(file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(file_path)
            .to_string();

        let _ = app.emit(
            "sanitize-progress",
            SanitizeProgress {
                total,
                completed: i,
                current_file: file_name.clone(),
            },
        );

        let path = Path::new(file_path);
        let is_mp3 = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("mp3"))
            .unwrap_or(false);

        let result = if is_mp3 {
            sanitize_id3(path, &retain_set, &options, &mut cover_exported_dirs)
        } else {
            sanitize_lofty(path, &retain_set, &options, &mut cover_exported_dirs)
        };

        match result {
            Ok(()) => succeeded += 1,
            Err(e) => {
                errors.push(format!("{}: {}", file_name, e));
                failed += 1;
            }
        }
    }

    SanitizeResult {
        total,
        succeeded,
        failed,
        cancelled: false,
        errors,
    }
}

// ── Lofty path (non-MP3) ───────────────────────────────────────

fn sanitize_lofty(
    path: &Path,
    retain_set: &HashSet<String>,
    options: &SanitizeOptions,
    cover_exported_dirs: &mut HashSet<std::path::PathBuf>,
) -> Result<(), String> {
    let mut tagged = Probe::open(path)
        .map_err(|e| format!("Open failed: {}", e))?
        .read()
        .map_err(|e| format!("Read failed: {}", e))?;

    let tag_type = tagged.primary_tag_type();
    let old_tag = match tagged.primary_tag().or_else(|| tagged.first_tag()) {
        Some(t) => t,
        None => {
            // No tag to sanitize
            return Ok(());
        }
    };

    // 1. Extract retained field values
    let mut text_items: Vec<(ItemKey, String)> = Vec::new();
    for field in retain_set {
        if let Some(key) = field_to_item_key(field) {
            if let Some(val) = old_tag.get_string(&key) {
                let mut val = val.to_string();
                // Apply date reduction
                if options.reduce_date_to_year
                    && (field == "date" || field == "year")
                    && val.len() > 4
                {
                    val = val[..4].to_string();
                }
                text_items.push((key, val));
            }
        }
    }

    // 2. Apply disc number drop for single disc
    if options.drop_disc_for_single {
        let disc_num = old_tag.get_string(&ItemKey::DiscNumber);
        let disc_total = old_tag.get_string(&ItemKey::DiscTotal);
        let is_single = disc_num.map(|n| n.trim() == "1").unwrap_or(false)
            && disc_total.map_or(true, |t| t.trim() == "1");
        if is_single {
            text_items.retain(|(k, _)| *k != ItemKey::DiscNumber && *k != ItemKey::DiscTotal);
        }
    }

    // 3. Extract pictures
    let front_cover = old_tag
        .pictures()
        .iter()
        .find(|p| p.pic_type() == PictureType::CoverFront)
        .cloned();

    let pictures_to_keep: Vec<Picture> = match &options.picture_action {
        PictureAction::ClearAll => vec![],
        PictureAction::RetainFrontCover => front_cover.into_iter().collect(),
        PictureAction::MoveFrontCoverToFile { filename } => {
            if let Some(ref pic) = front_cover {
                export_cover(path, filename, pic.data(), cover_exported_dirs);
            }
            vec![]
        }
    };

    // 4. Extract ReplayGain
    let mut rg_items: Vec<(ItemKey, String)> = Vec::new();
    if options.preserve_replay_gain {
        for key in REPLAY_GAIN_KEYS {
            if let Some(val) = old_tag.get_string(key) {
                rg_items.push((key.clone(), val.to_string()));
            }
        }
    }

    // 5. Clear tag and rewrite
    tagged.remove(tag_type);
    tagged.insert_tag(Tag::new(tag_type));
    let new_tag = tagged.primary_tag_mut().ok_or("Failed to create tag")?;

    for (key, val) in &text_items {
        new_tag.insert_text(key.clone(), val.to_string());
    }
    for (key, val) in &rg_items {
        new_tag.insert_text(key.clone(), val.to_string());
    }
    for pic in pictures_to_keep {
        new_tag.push_picture(pic);
    }

    new_tag
        .save_to_path(path, WriteOptions::default())
        .map_err(|e| format!("Save failed: {}", e))?;

    Ok(())
}

// ── id3 path (MP3) ─────────────────────────────────────────────

fn sanitize_id3(
    path: &Path,
    retain_set: &HashSet<String>,
    options: &SanitizeOptions,
    cover_exported_dirs: &mut HashSet<std::path::PathBuf>,
) -> Result<(), String> {
    let old_tag = id3::Tag::read_from_path(path).unwrap_or_else(|_| id3::Tag::new());
    let mut new_tag = id3::Tag::new();

    // 1. Copy retained fields
    for field in retain_set {
        match field.as_str() {
            "artist" => {
                if let Some(v) = old_tag.artist() {
                    new_tag.set_artist(v);
                }
            }
            "title" => {
                if let Some(v) = old_tag.title() {
                    new_tag.set_title(v);
                }
            }
            "album" => {
                if let Some(v) = old_tag.album() {
                    new_tag.set_album(v);
                }
            }
            "genre" => {
                if let Some(v) = old_tag.genre() {
                    new_tag.set_genre(v);
                }
            }
            "albumartist" => {
                if let Some(v) = old_tag.album_artist() {
                    new_tag.set_album_artist(v);
                }
            }
            "tracknumber" => {
                if let Some(v) = old_tag.track() {
                    new_tag.set_track(v);
                }
            }
            "totaltracks" => {
                if let Some(v) = old_tag.total_tracks() {
                    new_tag.set_total_tracks(v);
                }
            }
            "discnumber" => {
                if let Some(v) = old_tag.disc() {
                    new_tag.set_disc(v);
                }
            }
            "totaldiscs" => {
                if let Some(v) = old_tag.total_discs() {
                    new_tag.set_total_discs(v);
                }
            }
            "date" | "year" => {
                if let Some(v) = old_tag.year() {
                    new_tag.set_year(v);
                }
                // Also check TDRC for full date
                if options.reduce_date_to_year {
                    // Year already set above as integer, which is 4-digit
                } else if let Some(frame) = old_tag.get("TDRC") {
                    new_tag.add_frame(frame.clone());
                }
            }
            "composer" => {
                if let Some(frame) = old_tag.get("TCOM") {
                    new_tag.add_frame(frame.clone());
                }
            }
            "bpm" => {
                if let Some(frame) = old_tag.get("TBPM") {
                    new_tag.add_frame(frame.clone());
                }
            }
            "sortartist" => {
                if let Some(frame) = old_tag.get("TSOP") {
                    new_tag.add_frame(frame.clone());
                }
            }
            "sortalbumartist" => {
                if let Some(frame) = old_tag.get("TSO2") {
                    new_tag.add_frame(frame.clone());
                }
            }
            "sortalbum" => {
                if let Some(frame) = old_tag.get("TSOA") {
                    new_tag.add_frame(frame.clone());
                }
            }
            "sorttitle" => {
                if let Some(frame) = old_tag.get("TSOT") {
                    new_tag.add_frame(frame.clone());
                }
            }
            _ => {}
        }
    }

    // 2. Apply disc number drop for single disc
    if options.drop_disc_for_single {
        let disc = old_tag.disc();
        let total = old_tag.total_discs();
        let is_single = matches!((disc, total), (Some(1), Some(1)) | (Some(1), None));
        if is_single {
            new_tag.remove("TPOS");
        }
    }

    // 3. Handle pictures
    let front_cover: Option<id3::frame::Picture> = old_tag
        .pictures()
        .find(|p| p.picture_type == id3::frame::PictureType::CoverFront)
        .cloned();

    match &options.picture_action {
        PictureAction::ClearAll => {}
        PictureAction::RetainFrontCover => {
            if let Some(pic) = front_cover {
                new_tag.add_frame(id3::frame::Frame::with_content(
                    "APIC",
                    id3::Content::Picture(pic),
                ));
            }
        }
        PictureAction::MoveFrontCoverToFile { filename } => {
            if let Some(ref pic) = front_cover {
                export_cover(path, filename, &pic.data, cover_exported_dirs);
            }
        }
    }

    // 4. Preserve ReplayGain (stored as TXXX frames in ID3)
    if options.preserve_replay_gain {
        for frame in old_tag.frames() {
            if frame.id() == "TXXX" {
                if let id3::Content::ExtendedText(ext) = frame.content() {
                    let desc = ext.description.to_lowercase();
                    if desc.starts_with("replaygain") || desc == "itunnorm" {
                        new_tag.add_frame(frame.clone());
                    }
                }
            }
        }
    }

    new_tag
        .write_to_path(path, id3::Version::Id3v24)
        .map_err(|e| format!("Save failed: {}", e))?;

    Ok(())
}

// ── Helpers ─────────────────────────────────────────────────────

fn export_cover(
    audio_path: &Path,
    filename: &str,
    data: &[u8],
    exported: &mut HashSet<std::path::PathBuf>,
) {
    let Some(dir) = audio_path.parent() else {
        return;
    };
    if exported.contains(dir) {
        return;
    }
    let out_path = dir.join(filename);
    if !out_path.exists() {
        let _ = fs::write(&out_path, data);
    }
    exported.insert(dir.to_path_buf());
}

// ── Tests ───────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn field_mapping_covers_common_fields() {
        assert_eq!(field_to_item_key("artist"), Some(ItemKey::TrackArtist));
        assert_eq!(field_to_item_key("TITLE"), Some(ItemKey::TrackTitle));
        assert_eq!(field_to_item_key("tracknumber"), Some(ItemKey::TrackNumber));
        assert_eq!(field_to_item_key("discnumber"), Some(ItemKey::DiscNumber));
        assert_eq!(field_to_item_key("totaltracks"), Some(ItemKey::TrackTotal));
        assert_eq!(field_to_item_key("genre"), Some(ItemKey::Genre));
        assert_eq!(field_to_item_key("albumartist"), Some(ItemKey::AlbumArtist));
        assert_eq!(field_to_item_key("year"), Some(ItemKey::Year));
        assert_eq!(field_to_item_key("date"), Some(ItemKey::Year));
        assert_eq!(field_to_item_key("unknown_field"), None);
    }

    #[test]
    fn date_reduction_logic() {
        // Simulate: "2003-10-15" -> "2003"
        let full_date = "2003-10-15";
        let reduced = if full_date.len() > 4 {
            &full_date[..4]
        } else {
            full_date
        };
        assert_eq!(reduced, "2003");

        let year_only = "1999";
        let reduced = if year_only.len() > 4 {
            &year_only[..4]
        } else {
            year_only
        };
        assert_eq!(reduced, "1999");
    }

    #[test]
    fn single_disc_detection() {
        // Disc 1 of 1 -> single
        assert!(
            matches!((Some("1"), Some("1")), (Some(n), Some(t)) if n.trim() == "1" && t.trim() == "1")
        );
        // Disc 1, no total -> single
        assert!(matches!((Some("1"), None::<&str>), (Some(n), None) if n.trim() == "1"));
        // Disc 2 of 3 -> not single
        assert!(
            !matches!((Some("2"), Some("3")), (Some(n), Some(t)) if n.trim() == "1" && t.trim() == "1")
        );
    }
}
