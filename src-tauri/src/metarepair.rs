use crate::metadata::TrackMetadata;
use crate::musicbrainz::{self, MbRelease, MbReleaseDetail, MbTrack};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

const TITLE_MATCH_THRESHOLD: f64 = 0.7;

// ── Types ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum IssueSeverity {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum IssueKind {
    TitleMismatch,
    TrackNumberMissing,
    TrackNumberWrong,
    ArtistInconsistent,
    AlbumNameMismatch,
    YearMissing,
    YearMismatch,
    AlbumArtistMissing,
    SortArtistMissing,
    SortAlbumArtistMissing,
    TrackTotalWrong,
    MissingTrack,
}

#[derive(Debug, Clone, Serialize)]
pub struct TrackIssue {
    pub file_path: String,
    pub kind: IssueKind,
    pub severity: IssueSeverity,
    pub field: String,
    pub local_value: Option<String>,
    pub suggested_value: Option<String>,
    pub description: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TrackMatch {
    pub local_track: TrackMetadata,
    pub mb_track: Option<MbTrack>,
    pub match_confidence: f64,
    pub issues: Vec<TrackIssue>,
}

#[derive(Debug, Clone, Serialize)]
pub struct IssueSummary {
    pub error_count: usize,
    pub warning_count: usize,
    pub info_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct AlbumRepairReport {
    pub artist: String,
    pub album: String,
    pub folder_path: String,
    pub selected_release: Option<MbReleaseDetail>,
    pub alternative_releases: Vec<MbRelease>,
    pub match_confidence: f64,
    pub track_matches: Vec<TrackMatch>,
    pub missing_tracks: Vec<MbTrack>,
    pub issue_summary: IssueSummary,
}

#[derive(Debug, Clone, Serialize)]
pub struct RepairReport {
    pub albums: Vec<AlbumRepairReport>,
    pub total_issues: IssueSummary,
}

#[derive(Debug, Clone, Serialize)]
pub struct RepairLookupProgress {
    pub total_albums: usize,
    pub completed_albums: usize,
    pub current_album: String,
    pub phase: String,
}

// ── Album grouping ──────────────────────────────────────────────

struct AlbumGroup {
    artist: String,
    album: String,
    folder_path: String,
    tracks: Vec<TrackMetadata>,
}

fn group_tracks_by_album(tracks: Vec<TrackMetadata>) -> Vec<AlbumGroup> {
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

// ── Track matching ──────────────────────────────────────────────

fn match_tracks(
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
                // Verify with title similarity to avoid false matches
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

        // No position match — try fuzzy title match in pass 2
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

    // Collect unmatched MB tracks (missing locally)
    let missing: Vec<MbTrack> = mb_tracks
        .iter()
        .enumerate()
        .filter(|(i, _)| !used_mb[*i])
        .map(|(_, t)| t.clone())
        .collect();

    (matched, missing)
}

// ── Issue detection ─────────────────────────────────────────────

fn detect_issues(track_match: &mut TrackMatch, mb_release: &MbReleaseDetail) {
    let local = &track_match.local_track;
    let file_path = &local.file_path;

    let Some(mb) = &track_match.mb_track else {
        // No MB match — can't compare
        return;
    };

    // Title mismatch — flag if not a near-exact match
    let local_title = local.title.as_deref().unwrap_or("");
    let title_similarity =
        strsim::jaro_winkler(&local_title.to_lowercase(), &mb.title.to_lowercase());
    if !local_title.is_empty() && title_similarity < 0.99 {
        track_match.issues.push(TrackIssue {
            file_path: file_path.clone(),
            kind: IssueKind::TitleMismatch,
            severity: IssueSeverity::Warning,
            field: "title".to_string(),
            local_value: Some(local_title.to_string()),
            suggested_value: Some(mb.title.clone()),
            description: format!("Title differs from MusicBrainz: \"{}\"", mb.title),
        });
    }

    // Track number missing
    if local.track.is_none() {
        track_match.issues.push(TrackIssue {
            file_path: file_path.clone(),
            kind: IssueKind::TrackNumberMissing,
            severity: IssueSeverity::Error,
            field: "track".to_string(),
            local_value: None,
            suggested_value: Some(mb.position.to_string()),
            description: format!("Missing track number (should be {})", mb.position),
        });
    } else if local.track != Some(mb.position) {
        track_match.issues.push(TrackIssue {
            file_path: file_path.clone(),
            kind: IssueKind::TrackNumberWrong,
            severity: IssueSeverity::Warning,
            field: "track".to_string(),
            local_value: local.track.map(|n| n.to_string()),
            suggested_value: Some(mb.position.to_string()),
            description: format!(
                "Track number {} doesn't match MusicBrainz position {}",
                local.track.unwrap(),
                mb.position
            ),
        });
    }

    // Artist inconsistency (compare against track-level artist from MB)
    let local_artist = local.artist.as_deref().unwrap_or("");
    if !local_artist.is_empty()
        && !mb.artist.is_empty()
        && strsim::jaro_winkler(&local_artist.to_lowercase(), &mb.artist.to_lowercase()) < 0.9
    {
        track_match.issues.push(TrackIssue {
            file_path: file_path.clone(),
            kind: IssueKind::ArtistInconsistent,
            severity: IssueSeverity::Warning,
            field: "artist".to_string(),
            local_value: Some(local_artist.to_string()),
            suggested_value: Some(mb.artist.clone()),
            description: format!("Artist differs from MusicBrainz: \"{}\"", mb.artist),
        });
    }

    // Album name mismatch
    let local_album = local.album.as_deref().unwrap_or("");
    let mb_album = &mb_release.release.title;
    if !local_album.is_empty()
        && !mb_album.is_empty()
        && strsim::jaro_winkler(&local_album.to_lowercase(), &mb_album.to_lowercase()) < 0.95
    {
        track_match.issues.push(TrackIssue {
            file_path: file_path.clone(),
            kind: IssueKind::AlbumNameMismatch,
            severity: IssueSeverity::Warning,
            field: "album".to_string(),
            local_value: Some(local_album.to_string()),
            suggested_value: Some(mb_album.clone()),
            description: format!("Album name differs from MusicBrainz: \"{}\"", mb_album),
        });
    }

    // Year missing or mismatched
    let mb_year = mb_release
        .release
        .date
        .as_ref()
        .and_then(|d| d.split('-').next())
        .and_then(|y| y.parse::<u32>().ok());
    if let Some(mb_y) = mb_year {
        if local.year.is_none() {
            track_match.issues.push(TrackIssue {
                file_path: file_path.clone(),
                kind: IssueKind::YearMissing,
                severity: IssueSeverity::Info,
                field: "year".to_string(),
                local_value: None,
                suggested_value: Some(mb_y.to_string()),
                description: format!("Missing year (MusicBrainz: {})", mb_y),
            });
        } else if local.year != Some(mb_y) {
            track_match.issues.push(TrackIssue {
                file_path: file_path.clone(),
                kind: IssueKind::YearMismatch,
                severity: IssueSeverity::Info,
                field: "year".to_string(),
                local_value: local.year.map(|y| y.to_string()),
                suggested_value: Some(mb_y.to_string()),
                description: format!(
                    "Year {} differs from MusicBrainz ({})",
                    local.year.unwrap(),
                    mb_y
                ),
            });
        }
    }

    // Track total wrong
    let mb_track_count = mb_release.tracks.len() as u32;
    if let Some(total) = local.track_total {
        if total != mb_track_count {
            track_match.issues.push(TrackIssue {
                file_path: file_path.clone(),
                kind: IssueKind::TrackTotalWrong,
                severity: IssueSeverity::Info,
                field: "track_total".to_string(),
                local_value: Some(total.to_string()),
                suggested_value: Some(mb_track_count.to_string()),
                description: format!(
                    "Track total {} doesn't match MusicBrainz ({})",
                    total, mb_track_count
                ),
            });
        }
    }

    // Missing album_artist
    if local.album_artist.is_none() || local.album_artist.as_deref() == Some("") {
        let suggested = &mb_release.release.artist;
        if !suggested.is_empty() {
            track_match.issues.push(TrackIssue {
                file_path: file_path.clone(),
                kind: IssueKind::AlbumArtistMissing,
                severity: IssueSeverity::Warning,
                field: "album_artist".to_string(),
                local_value: None,
                suggested_value: Some(suggested.clone()),
                description: format!("Missing album artist (suggested: \"{}\")", suggested),
            });
        }
    }

    // Missing sort_artist
    if local.sort_artist.is_none() || local.sort_artist.as_deref() == Some("") {
        track_match.issues.push(TrackIssue {
            file_path: file_path.clone(),
            kind: IssueKind::SortArtistMissing,
            severity: IssueSeverity::Info,
            field: "sort_artist".to_string(),
            local_value: None,
            suggested_value: None,
            description: "Missing sort artist tag".to_string(),
        });
    }

    // Missing sort_album_artist
    if local.sort_album_artist.is_none() || local.sort_album_artist.as_deref() == Some("") {
        track_match.issues.push(TrackIssue {
            file_path: file_path.clone(),
            kind: IssueKind::SortAlbumArtistMissing,
            severity: IssueSeverity::Info,
            field: "sort_album_artist".to_string(),
            local_value: None,
            suggested_value: None,
            description: "Missing sort album artist tag".to_string(),
        });
    }
}

// ── Release selection ───────────────────────────────────────────

fn select_best_release(releases: &[MbRelease], local_track_count: usize) -> Option<usize> {
    if releases.is_empty() {
        return None;
    }

    // Prefer highest-scored release whose track count matches
    let matching = releases
        .iter()
        .enumerate()
        .filter(|(_, r)| r.track_count == local_track_count)
        .max_by_key(|(_, r)| r.score);

    if let Some((idx, _)) = matching {
        return Some(idx);
    }

    // Fall back to highest score regardless of track count
    Some(0)
}

// ── Main lookup + compare ───────────────────────────────────────

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

        // Skip albums with no artist or album name — can't search MB
        if group.artist.is_empty() || group.album.is_empty() {
            albums.push(build_no_match_report(group));
            continue;
        }

        // Search MusicBrainz
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

        // Select best release and fetch details
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

        // Match tracks and detect issues
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
            let avg_conf: f64 = track_matches
                .iter()
                .filter(|m| m.mb_track.is_some())
                .map(|m| m.match_confidence)
                .sum::<f64>()
                / matched_count.max(1) as f64;
            avg_conf
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

/// Compare local tracks against a specific alternative release.
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

// ── Helpers ─────────────────────────────────────────────────────

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

fn summarize_issues(track_matches: &[TrackMatch], missing_tracks: &[MbTrack]) -> IssueSummary {
    let mut error_count = 0;
    let mut warning_count = 0;
    let mut info_count = missing_tracks.len(); // Each missing track is an info

    for tm in track_matches {
        for issue in &tm.issues {
            match issue.severity {
                IssueSeverity::Error => error_count += 1,
                IssueSeverity::Warning => warning_count += 1,
                IssueSeverity::Info => info_count += 1,
            }
        }
    }

    IssueSummary {
        error_count,
        warning_count,
        info_count,
    }
}

fn summarize_all(albums: &[AlbumRepairReport]) -> IssueSummary {
    let mut total = IssueSummary {
        error_count: 0,
        warning_count: 0,
        info_count: 0,
    };
    for a in albums {
        total.error_count += a.issue_summary.error_count;
        total.warning_count += a.issue_summary.warning_count;
        total.info_count += a.issue_summary.info_count;
    }
    total
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_track(
        file_path: &str,
        title: &str,
        artist: &str,
        album: &str,
        track: Option<u32>,
    ) -> TrackMetadata {
        TrackMetadata {
            file_path: file_path.to_string(),
            file_name: file_path.split('/').last().unwrap_or("").to_string(),
            title: Some(title.to_string()),
            artist: Some(artist.to_string()),
            album: Some(album.to_string()),
            album_artist: None,
            sort_artist: None,
            sort_album_artist: None,
            track,
            track_total: None,
            year: Some(1969),
            genre: Some("Rock".to_string()),
        }
    }

    fn make_mb_track(position: u32, title: &str, artist: &str) -> MbTrack {
        MbTrack {
            position,
            title: title.to_string(),
            artist: artist.to_string(),
            length_ms: Some(180000),
        }
    }

    #[test]
    fn match_tracks_by_position() {
        let local = vec![
            make_track(
                "/a/01.mp3",
                "Come Together",
                "The Beatles",
                "Abbey Road",
                Some(1),
            ),
            make_track(
                "/a/02.mp3",
                "Something",
                "The Beatles",
                "Abbey Road",
                Some(2),
            ),
        ];
        let mb = vec![
            make_mb_track(1, "Come Together", "The Beatles"),
            make_mb_track(2, "Something", "The Beatles"),
        ];

        let (matched, missing) = match_tracks(&local, &mb);
        assert_eq!(matched.len(), 2);
        assert!(missing.is_empty());
        assert!(matched[0].mb_track.is_some());
        assert!(matched[1].mb_track.is_some());
        assert!(matched[0].match_confidence > 0.9);
    }

    #[test]
    fn match_tracks_by_title_fuzzy() {
        let local = vec![make_track(
            "/a/01.mp3",
            "Come Togehter",
            "The Beatles",
            "Abbey Road",
            None,
        )];
        let mb = vec![make_mb_track(1, "Come Together", "The Beatles")];

        let (matched, missing) = match_tracks(&local, &mb);
        assert_eq!(matched.len(), 1);
        assert!(matched[0].mb_track.is_some());
        assert!(missing.is_empty());
    }

    #[test]
    fn match_tracks_detects_missing() {
        let local = vec![make_track(
            "/a/01.mp3",
            "Come Together",
            "The Beatles",
            "Abbey Road",
            Some(1),
        )];
        let mb = vec![
            make_mb_track(1, "Come Together", "The Beatles"),
            make_mb_track(2, "Something", "The Beatles"),
        ];

        let (matched, missing) = match_tracks(&local, &mb);
        assert_eq!(matched.len(), 1);
        assert_eq!(missing.len(), 1);
        assert_eq!(missing[0].title, "Something");
    }

    #[test]
    fn detect_issues_title_mismatch() {
        let mb_detail = MbReleaseDetail {
            release: MbRelease {
                id: "123".to_string(),
                title: "Abbey Road".to_string(),
                artist: "The Beatles".to_string(),
                date: Some("1969-09-26".to_string()),
                track_count: 2,
                score: 100,
            },
            tracks: vec![make_mb_track(1, "Come Together", "The Beatles")],
        };

        let mut tm = TrackMatch {
            local_track: make_track(
                "/a/01.mp3",
                "Come Togehter",
                "The Beatles",
                "Abbey Road",
                Some(1),
            ),
            mb_track: Some(make_mb_track(1, "Come Together", "The Beatles")),
            match_confidence: 0.95,
            issues: Vec::new(),
        };

        detect_issues(&mut tm, &mb_detail);
        let title_issues: Vec<_> = tm
            .issues
            .iter()
            .filter(|i| i.kind == IssueKind::TitleMismatch)
            .collect();
        assert_eq!(title_issues.len(), 1);
        assert_eq!(
            title_issues[0].suggested_value.as_deref(),
            Some("Come Together")
        );
    }

    #[test]
    fn detect_issues_missing_album_artist() {
        let mb_detail = MbReleaseDetail {
            release: MbRelease {
                id: "123".to_string(),
                title: "Abbey Road".to_string(),
                artist: "The Beatles".to_string(),
                date: Some("1969-09-26".to_string()),
                track_count: 1,
                score: 100,
            },
            tracks: vec![make_mb_track(1, "Come Together", "The Beatles")],
        };

        let mut tm = TrackMatch {
            local_track: make_track(
                "/a/01.mp3",
                "Come Together",
                "The Beatles",
                "Abbey Road",
                Some(1),
            ),
            mb_track: Some(make_mb_track(1, "Come Together", "The Beatles")),
            match_confidence: 1.0,
            issues: Vec::new(),
        };

        detect_issues(&mut tm, &mb_detail);
        let aa_issues: Vec<_> = tm
            .issues
            .iter()
            .filter(|i| i.kind == IssueKind::AlbumArtistMissing)
            .collect();
        assert_eq!(aa_issues.len(), 1);
        assert_eq!(aa_issues[0].suggested_value.as_deref(), Some("The Beatles"));
    }

    #[test]
    fn detect_issues_year_missing() {
        let mb_detail = MbReleaseDetail {
            release: MbRelease {
                id: "123".to_string(),
                title: "Abbey Road".to_string(),
                artist: "The Beatles".to_string(),
                date: Some("1969-09-26".to_string()),
                track_count: 1,
                score: 100,
            },
            tracks: vec![make_mb_track(1, "Come Together", "The Beatles")],
        };

        let mut track = make_track(
            "/a/01.mp3",
            "Come Together",
            "The Beatles",
            "Abbey Road",
            Some(1),
        );
        track.year = None;

        let mut tm = TrackMatch {
            local_track: track,
            mb_track: Some(make_mb_track(1, "Come Together", "The Beatles")),
            match_confidence: 1.0,
            issues: Vec::new(),
        };

        detect_issues(&mut tm, &mb_detail);
        let year_issues: Vec<_> = tm
            .issues
            .iter()
            .filter(|i| i.kind == IssueKind::YearMissing)
            .collect();
        assert_eq!(year_issues.len(), 1);
        assert_eq!(year_issues[0].suggested_value.as_deref(), Some("1969"));
    }

    #[test]
    fn select_best_release_prefers_track_count_match() {
        let releases = vec![
            MbRelease {
                id: "a".to_string(),
                title: "Abbey Road".to_string(),
                artist: "The Beatles".to_string(),
                date: None,
                track_count: 17,
                score: 100,
            },
            MbRelease {
                id: "b".to_string(),
                title: "Abbey Road (Deluxe)".to_string(),
                artist: "The Beatles".to_string(),
                date: None,
                track_count: 40,
                score: 95,
            },
        ];

        assert_eq!(select_best_release(&releases, 17), Some(0));
        assert_eq!(select_best_release(&releases, 40), Some(1));
    }

    #[test]
    fn select_best_release_falls_back_to_highest_score() {
        let releases = vec![MbRelease {
            id: "a".to_string(),
            title: "Abbey Road".to_string(),
            artist: "The Beatles".to_string(),
            date: None,
            track_count: 17,
            score: 100,
        }];

        // No track count match, falls back to first (highest score)
        assert_eq!(select_best_release(&releases, 12), Some(0));
    }

    #[test]
    fn group_tracks_by_album_groups_correctly() {
        let tracks = vec![
            make_track(
                "/a/01.mp3",
                "Come Together",
                "The Beatles",
                "Abbey Road",
                Some(1),
            ),
            make_track(
                "/a/02.mp3",
                "Something",
                "The Beatles",
                "Abbey Road",
                Some(2),
            ),
            make_track("/b/01.flac", "Speak to Me", "Pink Floyd", "DSOTM", Some(1)),
        ];

        let groups = group_tracks_by_album(tracks);
        assert_eq!(groups.len(), 2);
    }

    #[test]
    fn summarize_issues_counts_correctly() {
        let matches = vec![TrackMatch {
            local_track: make_track("/a.mp3", "T", "A", "B", Some(1)),
            mb_track: None,
            match_confidence: 0.0,
            issues: vec![
                TrackIssue {
                    file_path: "/a.mp3".to_string(),
                    kind: IssueKind::TrackNumberMissing,
                    severity: IssueSeverity::Error,
                    field: "track".to_string(),
                    local_value: None,
                    suggested_value: Some("1".to_string()),
                    description: String::new(),
                },
                TrackIssue {
                    file_path: "/a.mp3".to_string(),
                    kind: IssueKind::YearMissing,
                    severity: IssueSeverity::Info,
                    field: "year".to_string(),
                    local_value: None,
                    suggested_value: Some("2000".to_string()),
                    description: String::new(),
                },
            ],
        }];

        let missing = vec![make_mb_track(2, "Track 2", "Artist")];
        let summary = summarize_issues(&matches, &missing);

        assert_eq!(summary.error_count, 1);
        assert_eq!(summary.warning_count, 0);
        assert_eq!(summary.info_count, 2); // 1 from issue + 1 from missing track
    }
}
