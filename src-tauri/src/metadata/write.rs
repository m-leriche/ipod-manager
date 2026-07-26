use crate::audio_utils::is_audio;
use crate::ffprobe_meta;
use id3::TagLike;
use lofty::config::WriteOptions;
use lofty::prelude::{Accessor, TagExt, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::ItemKey;
use std::io::{Seek, SeekFrom};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

use super::flac_inplace;
use super::{
    Id3WriteVersion, MetadataSaveProgress, MetadataSaveResult, MetadataUpdate, TrackMetadata,
};

pub fn save_metadata(
    updates: Vec<MetadataUpdate>,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
    id3_version: Id3WriteVersion,
) -> MetadataSaveResult {
    let total = updates.len();
    let mut succeeded = 0;
    let mut failed = 0;
    let mut errors = Vec::new();
    let mut undo_operations = Vec::new();

    // Tag writes can finish in a millisecond each; throttle progress events
    // so large batches don't flood the webview with hundreds of updates/sec.
    const PROGRESS_INTERVAL: std::time::Duration = std::time::Duration::from_millis(100);
    let mut last_emit: Option<std::time::Instant> = None;

    for (i, update) in updates.iter().enumerate() {
        if cancel_flag.load(Ordering::SeqCst) {
            return MetadataSaveResult {
                total,
                succeeded,
                failed,
                cancelled: true,
                errors,
                undo_operations,
            };
        }

        let file_name = Path::new(&update.file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&update.file_path)
            .to_string();

        let due = match last_emit {
            Some(t) => t.elapsed() >= PROGRESS_INTERVAL,
            None => true,
        };
        if due || i + 1 == total {
            last_emit = Some(std::time::Instant::now());
            let _ = app.emit(
                "metadata-save-progress",
                MetadataSaveProgress {
                    total,
                    completed: i,
                    current_file: file_name.clone(),
                },
            );
        }

        let snapshot = super::read::read_track(Path::new(&update.file_path));
        match apply_update(update, id3_version) {
            Ok(()) => {
                undo_operations.push(build_undo_operation(update, &snapshot));
                succeeded += 1;
            }
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
        undo_operations,
    }
}

/// Build a `MetadataUpdate` that reverses `update` by restoring the values
/// captured in `snapshot`.  Only fields that were changed by the original
/// update are included, so applying the undo operation writes back exactly
/// the old values without touching anything else.
///
/// Note: if a snapshot field was `None` (no tag existed), undo writes an empty
/// string or zero instead of removing the tag. The `MetadataUpdate` model has
/// no way to represent "clear this tag" (`None` = "don't touch"), so undo is
/// not perfectly lossless for previously-untagged fields.
fn build_undo_operation(update: &MetadataUpdate, snapshot: &TrackMetadata) -> MetadataUpdate {
    MetadataUpdate {
        file_path: update.file_path.clone(),
        // Filled in by the save command once the row id is known.
        track_id: None,
        title: update
            .title
            .as_ref()
            .map(|_| snapshot.title.clone().unwrap_or_default()),
        artist: update
            .artist
            .as_ref()
            .map(|_| snapshot.artist.clone().unwrap_or_default()),
        album: update
            .album
            .as_ref()
            .map(|_| snapshot.album.clone().unwrap_or_default()),
        album_artist: update
            .album_artist
            .as_ref()
            .map(|_| snapshot.album_artist.clone().unwrap_or_default()),
        sort_artist: update
            .sort_artist
            .as_ref()
            .map(|_| snapshot.sort_artist.clone().unwrap_or_default()),
        sort_album_artist: update
            .sort_album_artist
            .as_ref()
            .map(|_| snapshot.sort_album_artist.clone().unwrap_or_default()),
        track: update.track.map(|_| snapshot.track.unwrap_or(0)),
        track_total: update
            .track_total
            .map(|_| snapshot.track_total.unwrap_or(0)),
        disc_number: update
            .disc_number
            .map(|_| snapshot.disc_number.unwrap_or(0)),
        disc_total: update.disc_total.map(|_| snapshot.disc_total.unwrap_or(0)),
        year: update.year.map(|_| snapshot.year.unwrap_or(0)),
        genre: update
            .genre
            .as_ref()
            .map(|_| snapshot.genre.clone().unwrap_or_default()),
        compilation: update
            .compilation
            .map(|_| snapshot.compilation.unwrap_or(false)),
    }
}

fn apply_update(update: &MetadataUpdate, id3_version: Id3WriteVersion) -> Result<(), String> {
    let path = Path::new(&update.file_path);
    if !path.exists() {
        return Err("File not found".to_string());
    }
    if !is_audio(path) {
        return Err("Not an audio file".to_string());
    }

    let is_mp3 = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("mp3"))
        .unwrap_or(false);

    if is_mp3 {
        return apply_update_id3(path, update, id3_version);
    }

    // Try lofty first; if it can't open the file, fall back to ffmpeg
    match apply_update_lofty(path, update) {
        Ok(()) => Ok(()),
        Err(_) => apply_update_ffmpeg(path, update),
    }
}

/// Write tags via ffmpeg for files that lofty cannot parse.
fn apply_update_ffmpeg(path: &Path, update: &MetadataUpdate) -> Result<(), String> {
    let existing = ffprobe_meta::read_metadata(path);

    let resolve = |update_val: &Option<String>, existing_val: Option<String>| -> String {
        match update_val {
            Some(v) => v.clone(),
            None => existing_val.unwrap_or_default(),
        }
    };

    let ex = &existing;

    let track_str = format_number_pair(
        update.track.or(ex.as_ref().and_then(|m| m.track)),
        update
            .track_total
            .or(ex.as_ref().and_then(|m| m.track_total)),
    );
    let disc_str = format_number_pair(
        update.disc_number.or(ex.as_ref().and_then(|m| m.disc)),
        update.disc_total.or(ex.as_ref().and_then(|m| m.disc_total)),
    );
    let year_val = update
        .year
        .or(ex.as_ref().and_then(|m| m.year))
        .map(|y| y.to_string())
        .unwrap_or_default();

    let tags: Vec<(&str, String)> = vec![
        (
            "title",
            resolve(&update.title, ex.as_ref().and_then(|m| m.title.clone())),
        ),
        (
            "artist",
            resolve(&update.artist, ex.as_ref().and_then(|m| m.artist.clone())),
        ),
        (
            "album",
            resolve(&update.album, ex.as_ref().and_then(|m| m.album.clone())),
        ),
        (
            "album_artist",
            resolve(
                &update.album_artist,
                ex.as_ref().and_then(|m| m.album_artist.clone()),
            ),
        ),
        (
            "genre",
            resolve(&update.genre, ex.as_ref().and_then(|m| m.genre.clone())),
        ),
        (
            "sort_artist",
            resolve(
                &update.sort_artist,
                ex.as_ref().and_then(|m| m.sort_artist.clone()),
            ),
        ),
        (
            "sort_album_artist",
            resolve(
                &update.sort_album_artist,
                ex.as_ref().and_then(|m| m.sort_album_artist.clone()),
            ),
        ),
        ("track", track_str),
        ("disc", disc_str),
        ("date", year_val),
        // compilation is bool, not Option<String>, so it can't use resolve().
        // write_metadata strips all existing metadata (-map_metadata -1) and
        // rewrites from scratch, so every field must be written unconditionally.
        (
            "compilation",
            {
                let comp = update
                    .compilation
                    .unwrap_or_else(|| ex.as_ref().map(|m| m.compilation).unwrap_or(false));
                if comp {
                    "1"
                } else {
                    "0"
                }
            }
            .to_string(),
        ),
    ];

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

/// Write MP3 tags via the id3 crate.
fn apply_update_id3(
    path: &Path,
    update: &MetadataUpdate,
    id3_version: Id3WriteVersion,
) -> Result<(), String> {
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
    if let Some(v) = update.compilation {
        if v {
            tag.add_frame(id3::frame::Frame::text("TCMP", "1"));
        } else {
            tag.remove("TCMP");
        }
    }

    // v2.3 (the default) preserves "/" as literal characters in text frames.
    // The id3 crate converts "/" → "\0" when writing v2.4 (since "\0" is the
    // v2.4 multi-value separator), which corrupts artist names like "dd/mm/yyyy"
    // into three separate values where only the first ("dd") is returned.
    let version = match id3_version {
        Id3WriteVersion::V23 => id3::Version::Id3v23,
        Id3WriteVersion::V24 => id3::Version::Id3v24,
    };
    write_id3_filling_region(path, &tag, version)
}

/// Slack left after the tag when the existing region is too small to reuse, so
/// the *next* edit to this file lands in place instead of shifting audio again.
const ID3_PADDING: usize = 4096;

/// Write an ID3v2 tag sized to exactly fill the file's existing tag region.
///
/// `id3` only writes without touching the audio when the encoded tag is exactly
/// as long as the region it replaces — both a longer and a shorter tag make it
/// shift the entire stream to grow or shrink the gap. Measuring the region first
/// and padding the tag out to fill it keeps the common edit (same frames, new
/// value) a few-KB write instead of rewriting the whole file.
///
/// Getting the region size wrong is safe, just slow: `id3` falls back to
/// shifting, which is what it did unconditionally before.
fn write_id3_filling_region(
    path: &Path,
    tag: &id3::Tag,
    version: id3::Version,
) -> Result<(), String> {
    let encoder = id3::Encoder::new().version(version);

    let mut encoded = Vec::new();
    encoder
        .encode(tag, &mut encoded)
        .map_err(|e| format!("Save failed: {}", e))?;

    let padding = match existing_id3_region_len(path) {
        Some(region) => region.checked_sub(encoded.len()).unwrap_or(ID3_PADDING),
        None => ID3_PADDING,
    };

    id3::Encoder::new()
        .version(version)
        .padding(padding)
        .write_to_path(tag, path)
        .map_err(|e| format!("Save failed: {}", e))
}

/// Byte length of the ID3v2 region `id3` will replace: the declared tag area
/// plus any zero bytes immediately after it.
///
/// Mirrors `id3`'s own `locate_id3v2`, which is not publicly reachable. Returns
/// `None` when there is no reusable region — no tag, an extended header (whose
/// size `id3` subtracts in a way not worth replicating), or a tag that overruns
/// the file.
fn existing_id3_region_len(path: &Path) -> Option<usize> {
    use std::io::Read;

    let mut file = std::fs::File::open(path).ok()?;
    let mut header = [0u8; 10];
    file.read_exact(&mut header).ok()?;
    if &header[..3] != b"ID3" {
        return None;
    }
    const EXTENDED_HEADER: u8 = 0x40;
    if header[5] & EXTENDED_HEADER != 0 {
        return None;
    }

    // The size field is 4 synchsafe bytes: 7 significant bits each.
    let declared = header[6..10]
        .iter()
        .try_fold(0usize, |acc, b| match b & 0x80 {
            0 => Some((acc << 7) | (*b as usize)),
            _ => None,
        })?;
    let tag_area = 10usize.checked_add(declared)?;

    let file_len = file.metadata().ok()?.len() as usize;
    if tag_area >= file_len {
        return None;
    }

    // Trailing zeros past the declared area count as padding too. Audio frames
    // open with a sync word, so in practice this stops at the first byte; the cap
    // just bounds the read on pathological input.
    const MAX_TRAILING_SCAN: usize = 64 * 1024;
    file.seek(SeekFrom::Start(tag_area as u64)).ok()?;
    let mut scan = vec![0u8; MAX_TRAILING_SCAN.min(file_len - tag_area)];
    let read = read_up_to(&mut file, &mut scan);
    let trailing = scan[..read].iter().take_while(|b| **b == 0).count();

    Some(tag_area + trailing)
}

/// Fill as much of `buf` as the file has left, returning how many bytes landed.
/// A short read just means fewer trailing bytes to inspect.
fn read_up_to(file: &mut std::fs::File, buf: &mut [u8]) -> usize {
    use std::io::Read;

    let mut filled = 0;
    while filled < buf.len() {
        match file.read(&mut buf[filled..]) {
            Ok(0) => break,
            Ok(n) => filled += n,
            Err(_) => break,
        }
    }
    filled
}

/// Write tags for non-MP3 formats via lofty.
///
/// FLAC takes an in-place path first: lofty rewrites the entire stream for any
/// tag change (see `flac_inplace`), which on a large FLAC costs a full file
/// read + write. `write_in_place` returns `false` when the new tags don't fit
/// the existing metadata region, and only then do we pay for a full rewrite.
fn apply_update_lofty(path: &Path, update: &MetadataUpdate) -> Result<(), String> {
    let mut tagged = Probe::open(path)
        .map_err(|e| format!("Open failed: {}", e))?
        .read()
        .map_err(|e| format!("Read failed: {}", e))?;

    let is_flac = tagged.file_type() == lofty::file::FileType::Flac;

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
    if let Some(v) = update.compilation {
        if v {
            tag.insert_text(ItemKey::FlagCompilation, "1".to_string());
        } else {
            tag.remove_key(&ItemKey::FlagCompilation);
        }
    }

    if is_flac && flac_inplace::write_in_place(path, tag)? {
        return Ok(());
    }

    tag.save_to_path(path, WriteOptions::default())
        .map_err(|e| format!("Save failed: {}", e))?;

    Ok(())
}

#[cfg(test)]
#[path = "write_tests.rs"]
mod tests;
