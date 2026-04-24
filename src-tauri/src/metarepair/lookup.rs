use crate::metadata::TrackMetadata;
use crate::musicbrainz::{self, MbRelease};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

use super::detection::{detect_issues, summarize_all, summarize_issues};
use super::matching::{group_tracks_by_album, match_tracks, select_best_release};
use super::types::{
    AlbumGroup, AlbumRepairReport, IssueSummary, RepairLookupProgress, RepairReport, TrackMatch,
};

pub fn lookup_and_compare(
    tracks: Vec<TrackMetadata>,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
) -> Result<RepairReport, String> {
    let groups = group_tracks_by_album(tracks);
    let total_albums = groups.len();
    let mut albums = Vec::new();

    for (i, group) in groups.into_iter().enumerate() {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err("Cancelled".to_string());
        }

        let display_name = if group.artist.is_empty() && group.album.is_empty() {
            "[Unknown]".to_string()
        } else {
            format!("{} - {}", group.artist, group.album)
        };

        let _ = app.emit(
            "repair-lookup-progress",
            RepairLookupProgress {
                total_albums,
                completed_albums: i,
                current_album: display_name.clone(),
                phase: "searching".to_string(),
            },
        );

        if group.artist.is_empty() || group.album.is_empty() {
            albums.push(build_no_match_report(group));
            continue;
        }

        let releases = match musicbrainz::search_releases(&group.artist, &group.album) {
            Ok(r) => r,
            Err(_) => {
                albums.push(build_no_match_report(group));
                continue;
            }
        };

        if releases.is_empty() {
            albums.push(build_no_match_report(group));
            continue;
        }

        let best_idx = select_best_release(&releases, group.tracks.len()).unwrap_or(0);

        if cancel_flag.load(Ordering::SeqCst) {
            return Err("Cancelled".to_string());
        }

        let _ = app.emit(
            "repair-lookup-progress",
            RepairLookupProgress {
                total_albums,
                completed_albums: i,
                current_album: display_name,
                phase: "fetching_details".to_string(),
            },
        );

        let detail = match musicbrainz::fetch_release_detail(&releases[best_idx].id) {
            Ok(d) => d,
            Err(_) => {
                albums.push(build_no_match_report(group));
                continue;
            }
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

        albums.push(AlbumRepairReport {
            artist: group.artist,
            album: group.album,
            folder_path: group.folder_path,
            selected_release: Some(detail),
            alternative_releases,
            match_confidence,
            track_matches,
            missing_tracks,
            issue_summary,
        });
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

    let total_issues = summarize_all(&albums);

    Ok(RepairReport {
        albums,
        total_issues,
    })
}

pub fn compare_against_release(
    tracks: Vec<TrackMetadata>,
    mbid: &str,
) -> Result<AlbumRepairReport, String> {
    let detail = musicbrainz::fetch_release_detail(mbid)?;

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
