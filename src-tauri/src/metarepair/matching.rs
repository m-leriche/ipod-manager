use crate::metadata::TrackMetadata;
use crate::musicbrainz::{MbRelease, MbTrack};
use std::collections::HashMap;
use std::path::Path;

use super::types::{AlbumGroup, TrackMatch};
use super::TITLE_MATCH_THRESHOLD;

pub(super) fn group_tracks_by_album(tracks: Vec<TrackMetadata>) -> Vec<AlbumGroup> {
    let mut groups: HashMap<(String, String), Vec<TrackMetadata>> = HashMap::new();

    for track in tracks {
        let artist = track.artist.clone().unwrap_or_default();
        let album = track.album.clone().unwrap_or_default();
        groups.entry((artist, album)).or_default().push(track);
    }

    let mut result: Vec<AlbumGroup> = groups
        .into_iter()
        .map(|((artist, album), mut tracks)| {
            tracks.sort_by_key(|t| t.track.unwrap_or(999));
            let folder_path = tracks
                .first()
                .map(|t| {
                    Path::new(&t.file_path)
                        .parent()
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_default()
                })
                .unwrap_or_default();
            AlbumGroup {
                artist,
                album,
                folder_path,
                tracks,
            }
        })
        .collect();

    result.sort_by(|a, b| {
        a.artist
            .to_lowercase()
            .cmp(&b.artist.to_lowercase())
            .then_with(|| a.album.to_lowercase().cmp(&b.album.to_lowercase()))
    });

    result
}

pub(super) fn match_tracks(
    local_tracks: &[TrackMetadata],
    mb_tracks: &[MbTrack],
) -> (Vec<TrackMatch>, Vec<MbTrack>) {
    let mut matched: Vec<TrackMatch> = Vec::new();
    let mut used_mb: Vec<bool> = vec![false; mb_tracks.len()];

    // Pass 1: match by track number
    for local in local_tracks {
        if let Some(track_num) = local.track {
            if let Some(idx) = mb_tracks.iter().position(|mb| {
                mb.position == track_num
                    && !used_mb[mb_tracks
                        .iter()
                        .position(|m| std::ptr::eq(m, mb))
                        .unwrap_or(usize::MAX)]
            }) {
                let local_title = local.title.as_deref().unwrap_or("");
                let similarity = strsim::jaro_winkler(
                    &local_title.to_lowercase(),
                    &mb_tracks[idx].title.to_lowercase(),
                );

                if similarity >= TITLE_MATCH_THRESHOLD {
                    used_mb[idx] = true;
                    matched.push(TrackMatch {
                        local_track: local.clone(),
                        mb_track: Some(mb_tracks[idx].clone()),
                        match_confidence: similarity,
                        issues: Vec::new(),
                    });
                    continue;
                }
            }
        }

        matched.push(TrackMatch {
            local_track: local.clone(),
            mb_track: None,
            match_confidence: 0.0,
            issues: Vec::new(),
        });
    }

    // Pass 2: fuzzy title match for unmatched tracks
    for tm in matched.iter_mut().filter(|m| m.mb_track.is_none()) {
        let local_title = tm.local_track.title.as_deref().unwrap_or("");
        if local_title.is_empty() {
            continue;
        }

        let mut best_idx = None;
        let mut best_score = 0.0f64;

        for (idx, mb) in mb_tracks.iter().enumerate() {
            if used_mb[idx] {
                continue;
            }
            let score = strsim::jaro_winkler(&local_title.to_lowercase(), &mb.title.to_lowercase());
            if score > best_score && score >= TITLE_MATCH_THRESHOLD {
                best_score = score;
                best_idx = Some(idx);
            }
        }

        if let Some(idx) = best_idx {
            used_mb[idx] = true;
            tm.mb_track = Some(mb_tracks[idx].clone());
            tm.match_confidence = best_score;
        }
    }

    let missing: Vec<MbTrack> = mb_tracks
        .iter()
        .enumerate()
        .filter(|(i, _)| !used_mb[*i])
        .map(|(_, t)| t.clone())
        .collect();

    (matched, missing)
}

pub(super) fn select_best_release(
    releases: &[MbRelease],
    local_track_count: usize,
) -> Option<usize> {
    if releases.is_empty() {
        return None;
    }

    let matching = releases
        .iter()
        .enumerate()
        .filter(|(_, r)| r.track_count == local_track_count)
        .max_by_key(|(_, r)| r.score);

    if let Some((idx, _)) = matching {
        return Some(idx);
    }

    Some(0)
}
