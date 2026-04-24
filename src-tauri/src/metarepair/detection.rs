use crate::musicbrainz::{MbReleaseDetail, MbTrack};

use super::types::{
    AlbumRepairReport, IssueKind, IssueSeverity, IssueSummary, TrackIssue, TrackMatch,
};

pub(super) fn detect_issues(track_match: &mut TrackMatch, mb_release: &MbReleaseDetail) {
    let local = &track_match.local_track;
    let file_path = &local.file_path;

    let Some(mb) = &track_match.mb_track else {
        return;
    };

    // Title mismatch
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

    // Track number missing or wrong
    match local.track {
        None => {
            track_match.issues.push(TrackIssue {
                file_path: file_path.clone(),
                kind: IssueKind::TrackNumberMissing,
                severity: IssueSeverity::Error,
                field: "track".to_string(),
                local_value: None,
                suggested_value: Some(mb.position.to_string()),
                description: format!("Missing track number (should be {})", mb.position),
            });
        }
        Some(n) if n != mb.position => {
            track_match.issues.push(TrackIssue {
                file_path: file_path.clone(),
                kind: IssueKind::TrackNumberWrong,
                severity: IssueSeverity::Warning,
                field: "track".to_string(),
                local_value: Some(n.to_string()),
                suggested_value: Some(mb.position.to_string()),
                description: format!(
                    "Track number {} doesn't match MusicBrainz position {}",
                    n, mb.position
                ),
            });
        }
        _ => {}
    }

    // Artist inconsistency
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
        match local.year {
            None => {
                track_match.issues.push(TrackIssue {
                    file_path: file_path.clone(),
                    kind: IssueKind::YearMissing,
                    severity: IssueSeverity::Info,
                    field: "year".to_string(),
                    local_value: None,
                    suggested_value: Some(mb_y.to_string()),
                    description: format!("Missing year (MusicBrainz: {})", mb_y),
                });
            }
            Some(y) if y != mb_y => {
                track_match.issues.push(TrackIssue {
                    file_path: file_path.clone(),
                    kind: IssueKind::YearMismatch,
                    severity: IssueSeverity::Info,
                    field: "year".to_string(),
                    local_value: Some(y.to_string()),
                    suggested_value: Some(mb_y.to_string()),
                    description: format!("Year {} differs from MusicBrainz ({})", y, mb_y),
                });
            }
            _ => {}
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

pub(super) fn summarize_issues(
    track_matches: &[TrackMatch],
    missing_tracks: &[MbTrack],
) -> IssueSummary {
    let mut error_count = 0;
    let mut warning_count = 0;
    let mut info_count = missing_tracks.len();

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

pub(super) fn summarize_all(albums: &[AlbumRepairReport]) -> IssueSummary {
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
