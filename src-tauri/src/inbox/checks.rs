use lofty::prelude::TaggedFileExt;
use lofty::probe::Probe;
use rusqlite::{params, Connection};
use std::path::Path;

use crate::albumart;
use crate::library::types::TrackData;
use crate::metarepair::matching::select_best_release;
use crate::musicbrainz::{self, normalize_for_search, MbRelease};

use super::types::CheckResult;

const LOSSLESS_FORMATS: &[&str] = &["FLAC", "WAV", "AIFF", "ALAC"];

pub(super) fn check_tags(tracks: &[TrackData]) -> CheckResult {
    let count_missing = |field: fn(&TrackData) -> bool| tracks.iter().filter(|t| field(t)).count();

    let missing: Vec<String> = [
        ("title", count_missing(|t| t.title.is_none())),
        ("artist", count_missing(|t| t.artist.is_none())),
        ("album", count_missing(|t| t.album.is_none())),
        ("track #", count_missing(|t| t.track_number.is_none())),
    ]
    .iter()
    .filter(|(_, n)| *n > 0)
    .map(|(field, n)| format!("{} missing {}", n, field))
    .collect();

    if !missing.is_empty() {
        return CheckResult::fail(missing.join(", "));
    }

    let albums: Vec<&str> = tracks.iter().filter_map(|t| t.album.as_deref()).collect();
    if albums.windows(2).any(|w| w[0] != w[1]) {
        return CheckResult::fail("Inconsistent album tags".to_string());
    }

    CheckResult::pass(None)
}

pub(super) fn check_cover(folder: &Path, audio_paths: &[std::path::PathBuf]) -> CheckResult {
    if albumart::find_cover(folder).is_some() {
        return CheckResult::pass(None);
    }
    if has_embedded_art(audio_paths) {
        return CheckResult::warn("Embedded art only — no cover file".to_string());
    }
    CheckResult::fail("No cover file or embedded art".to_string())
}

fn has_embedded_art(audio_paths: &[std::path::PathBuf]) -> bool {
    audio_paths.iter().any(|path| {
        Probe::open(path)
            .and_then(|p| p.read())
            .ok()
            .and_then(|tagged| {
                tagged
                    .primary_tag()
                    .or_else(|| tagged.first_tag())
                    .map(|tag| !tag.pictures().is_empty())
            })
            .unwrap_or(false)
    })
}

/// Local track-numbering check. Pass is impossible here — a clean sequence
/// stays `pending` until MusicBrainz confirms the count.
pub(super) fn local_tracklist(tracks: &[TrackData]) -> CheckResult {
    let mut numbers: Vec<u32> = match tracks.iter().map(|t| t.track_number).collect() {
        Some(n) => n,
        None => return CheckResult::fail("Cannot verify — missing track numbers".to_string()),
    };
    numbers.sort_unstable();

    if numbers.windows(2).any(|w| w[0] == w[1]) {
        return CheckResult::fail("Duplicate track numbers".to_string());
    }

    let expected = tracks
        .iter()
        .filter_map(|t| t.track_total)
        .max()
        .unwrap_or(*numbers.last().unwrap_or(&0));

    let gaps: Vec<String> = (1..=expected)
        .filter(|n| !numbers.contains(n))
        .map(|n| n.to_string())
        .collect();
    if !gaps.is_empty() {
        return CheckResult::fail(format!("Missing track(s) {}", gaps.join(", ")));
    }

    CheckResult::pending()
}

pub(super) fn check_duplicate(
    conn: &Connection,
    artist: Option<&str>,
    album: Option<&str>,
    tracks: &[TrackData],
) -> CheckResult {
    let (Some(artist), Some(album)) = (artist, album) else {
        return CheckResult::warn("Not checked — missing artist/album tags".to_string());
    };

    let library_tracks: Vec<(String, Option<u32>)> = match conn
        .prepare(
            "SELECT format, bitrate_kbps FROM tracks
             WHERE LOWER(album) = LOWER(?2)
               AND (LOWER(artist) = LOWER(?1) OR LOWER(album_artist) = LOWER(?1))",
        )
        .and_then(|mut stmt| {
            stmt.query_map(params![artist, album], |row| Ok((row.get(0)?, row.get(1)?)))?
                .collect()
        }) {
        Ok(rows) => rows,
        Err(e) => return CheckResult::warn(format!("Library lookup failed: {}", e)),
    };

    if library_tracks.is_empty() {
        return CheckResult::pass(Some("Not in library".to_string()));
    }

    let library_rank = library_tracks
        .iter()
        .map(|(f, b)| quality_rank(f, *b))
        .min()
        .unwrap_or(0);
    let inbox_rank = tracks
        .iter()
        .map(|t| quality_rank(&t.format, t.bitrate_kbps))
        .min()
        .unwrap_or(0);

    let library_desc = library_tracks
        .iter()
        .min_by_key(|(f, b)| quality_rank(f, *b))
        .map(|(f, b)| quality_desc(f, *b))
        .unwrap_or_default();
    let inbox_desc = tracks
        .iter()
        .min_by_key(|t| quality_rank(&t.format, t.bitrate_kbps))
        .map(|t| quality_desc(&t.format, t.bitrate_kbps))
        .unwrap_or_default();

    if inbox_rank > library_rank {
        CheckResult::warn(format!(
            "Upgrades library copy ({} → {})",
            library_desc, inbox_desc
        ))
    } else {
        CheckResult::fail(format!(
            "Already in library in {} quality ({})",
            if inbox_rank == library_rank {
                "equal"
            } else {
                "better"
            },
            library_desc
        ))
    }
}

// All lossless ranks equal — a 24/96 inbox copy of a 16/44.1 library album
// counts as "equal quality" and blocks (override remains available).
pub(super) fn quality_rank(format: &str, bitrate_kbps: Option<u32>) -> u32 {
    if LOSSLESS_FORMATS.contains(&format.to_uppercase().as_str()) {
        1_000_000
    } else {
        bitrate_kbps.unwrap_or(0)
    }
}

pub(super) fn quality_desc(format: &str, bitrate_kbps: Option<u32>) -> String {
    let format = format.to_uppercase();
    if LOSSLESS_FORMATS.contains(&format.as_str()) {
        format
    } else {
        match bitrate_kbps {
            Some(b) => format!("{} {} kbps", format, b),
            None => format,
        }
    }
}

/// Verify the local track count against the best MusicBrainz release match.
pub fn verify_tracklist(artist: &str, album: &str, track_count: usize) -> CheckResult {
    let artist = normalize_for_search(artist);
    let album = normalize_for_search(album);

    match musicbrainz::search_releases(&artist, &album, None) {
        Ok(releases) => tracklist_verdict(&releases, track_count),
        Err(e) => CheckResult::warn(format!("Could not verify: {}", e)),
    }
}

/// The verdict for a search result. Selection goes through `select_best_release`
/// so the pill and the comparison panel always name the same release — the
/// panel resolves its release from the same function.
pub(super) fn tracklist_verdict(releases: &[MbRelease], track_count: usize) -> CheckResult {
    let Some(idx) = select_best_release(releases, track_count) else {
        return CheckResult::warn("No MusicBrainz match found".to_string());
    };
    let best = &releases[idx];

    if best.track_count == track_count {
        return CheckResult::pass(Some(format!(
            "Matches “{}” ({} tracks)",
            best.title, best.track_count
        )));
    }

    CheckResult::fail(format!(
        "{} tracks here vs {} on “{}”",
        track_count, best.track_count, best.title
    ))
}
