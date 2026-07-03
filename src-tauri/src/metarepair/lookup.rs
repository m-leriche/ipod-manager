use crate::metadata::TrackMetadata;
use crate::musicbrainz::{self, MbCache, MbRelease};
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

use super::detection::{detect_issues, summarize_all, summarize_issues};
use super::matching::{group_tracks_by_album, match_tracks, select_best_release};
use super::types::{
    AlbumGroup, AlbumRepairReport, IssueSummary, RepairLookupProgress, RepairReport, TrackMatch,
};

/// Worker threads for the batch lookup. The MusicBrainz rate limiter keeps
/// network requests serialized; workers overlap matching work and cache hits.
const WORKER_THREADS: usize = 4;

pub fn lookup_and_compare(
    tracks: Vec<TrackMetadata>,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
    cache: &MbCache,
) -> Result<RepairReport, String> {
    let groups = group_tracks_by_album(tracks);
    let total_albums = groups.len();
    let queue = Mutex::new(groups.into_iter().enumerate());
    let completed = AtomicUsize::new(0);
    let results: Mutex<Vec<(usize, AlbumRepairReport)>> = Mutex::new(Vec::new());

    std::thread::scope(|s| {
        for _ in 0..WORKER_THREADS.min(total_albums.max(1)) {
            s.spawn(|| loop {
                if cancel_flag.load(Ordering::SeqCst) {
                    break;
                }
                let Some((idx, group)) = queue.lock().ok().and_then(|mut q| q.next()) else {
                    break;
                };

                let Some(report) =
                    analyze_group(group, &app, &cancel_flag, cache, &completed, total_albums)
                else {
                    break; // cancelled mid-album
                };

                completed.fetch_add(1, Ordering::SeqCst);
                if let Ok(mut r) = results.lock() {
                    r.push((idx, report));
                }
            });
        }
    });

    if cancel_flag.load(Ordering::SeqCst) {
        return Err("Cancelled".to_string());
    }

    let _ = app.emit(
        "repair-lookup-progress",
        RepairLookupProgress {
            total_albums,
            completed_albums: total_albums,
            current_album: String::new(),
            phase: "done".to_string(),
        },
    );

    let mut pairs = results.into_inner().unwrap_or_else(|e| e.into_inner());
    pairs.sort_by_key(|(idx, _)| *idx);
    let albums: Vec<AlbumRepairReport> = pairs.into_iter().map(|(_, report)| report).collect();

    let total_issues = summarize_all(&albums);

    Ok(RepairReport {
        albums,
        total_issues,
    })
}

/// Look up one album group on MusicBrainz and compare its tracks.
/// Returns `None` only when cancelled mid-album.
fn analyze_group(
    group: AlbumGroup,
    app: &AppHandle,
    cancel_flag: &Arc<AtomicBool>,
    cache: &MbCache,
    completed: &AtomicUsize,
    total_albums: usize,
) -> Option<AlbumRepairReport> {
    let display_name = if group.artist.is_empty() && group.album.is_empty() {
        "[Unknown]".to_string()
    } else {
        format!("{} - {}", group.artist, group.album)
    };

    let _ = app.emit(
        "repair-lookup-progress",
        RepairLookupProgress {
            total_albums,
            completed_albums: completed.load(Ordering::SeqCst),
            current_album: display_name.clone(),
            phase: "searching".to_string(),
        },
    );

    if group.artist.is_empty() || group.album.is_empty() {
        return Some(build_no_match_report(group));
    }

    let releases = match musicbrainz::search_releases(&group.artist, &group.album, Some(cache)) {
        Ok(r) => r,
        Err(_) => return Some(build_no_match_report(group)),
    };

    if releases.is_empty() {
        return Some(build_no_match_report(group));
    }

    let best_idx = select_best_release(&releases, group.tracks.len()).unwrap_or(0);

    if cancel_flag.load(Ordering::SeqCst) {
        return None;
    }

    let _ = app.emit(
        "repair-lookup-progress",
        RepairLookupProgress {
            total_albums,
            completed_albums: completed.load(Ordering::SeqCst),
            current_album: display_name,
            phase: "fetching_details".to_string(),
        },
    );

    let detail = match musicbrainz::fetch_release_detail(&releases[best_idx].id, Some(cache)) {
        Ok(d) => d,
        Err(_) => return Some(build_no_match_report(group)),
    };

    let (mut track_matches, missing_tracks) = match_tracks(&group.tracks, &detail.tracks);

    for tm in &mut track_matches {
        detect_issues(tm, &detail);
    }

    let issue_summary = summarize_issues(&track_matches, &missing_tracks);
    let match_confidence = if detail.tracks.is_empty() {
        0.0
    } else {
        let matched_count = track_matches
            .iter()
            .filter(|m| m.mb_track.is_some())
            .count();
        track_matches
            .iter()
            .filter(|m| m.mb_track.is_some())
            .map(|m| m.match_confidence)
            .sum::<f64>()
            / matched_count.max(1) as f64
    };

    let alternative_releases: Vec<MbRelease> = releases
        .into_iter()
        .enumerate()
        .filter(|(idx, _)| *idx != best_idx)
        .map(|(_, r)| r)
        .collect();

    Some(AlbumRepairReport {
        artist: group.artist,
        album: group.album,
        folder_path: group.folder_path,
        selected_release: Some(detail),
        alternative_releases,
        match_confidence,
        track_matches,
        missing_tracks,
        issue_summary,
    })
}

pub fn compare_against_release(
    tracks: Vec<TrackMetadata>,
    mbid: &str,
    cache: &MbCache,
) -> Result<AlbumRepairReport, String> {
    let detail = musicbrainz::fetch_release_detail(mbid, Some(cache))?;

    let artist = tracks
        .first()
        .and_then(|t| t.artist.clone())
        .unwrap_or_default();
    let album = tracks
        .first()
        .and_then(|t| t.album.clone())
        .unwrap_or_default();
    let folder_path = tracks
        .first()
        .map(|t| {
            Path::new(&t.file_path)
                .parent()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default()
        })
        .unwrap_or_default();

    let (mut track_matches, missing_tracks) = match_tracks(&tracks, &detail.tracks);

    for tm in &mut track_matches {
        detect_issues(tm, &detail);
    }

    let issue_summary = summarize_issues(&track_matches, &missing_tracks);
    let match_confidence = if detail.tracks.is_empty() {
        0.0
    } else {
        let matched_count = track_matches
            .iter()
            .filter(|m| m.mb_track.is_some())
            .count();
        track_matches
            .iter()
            .filter(|m| m.mb_track.is_some())
            .map(|m| m.match_confidence)
            .sum::<f64>()
            / matched_count.max(1) as f64
    };

    Ok(AlbumRepairReport {
        artist,
        album,
        folder_path,
        selected_release: Some(detail),
        alternative_releases: Vec::new(),
        match_confidence,
        track_matches,
        missing_tracks,
        issue_summary,
    })
}

fn build_no_match_report(group: AlbumGroup) -> AlbumRepairReport {
    let track_matches: Vec<TrackMatch> = group
        .tracks
        .into_iter()
        .map(|t| TrackMatch {
            local_track: t,
            mb_track: None,
            match_confidence: 0.0,
            issues: Vec::new(),
        })
        .collect();

    AlbumRepairReport {
        artist: group.artist,
        album: group.album,
        folder_path: group.folder_path,
        selected_release: None,
        alternative_releases: Vec::new(),
        match_confidence: 0.0,
        track_matches,
        missing_tracks: Vec::new(),
        issue_summary: IssueSummary {
            error_count: 0,
            warning_count: 0,
            info_count: 0,
        },
    }
}
