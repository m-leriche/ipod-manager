use crate::metadata::TrackMetadata;
use crate::metarepair::detection::{detect_issues, summarize_issues};
use crate::metarepair::matching::{group_tracks_by_album, match_tracks, select_best_release};
use crate::metarepair::types::*;
use crate::musicbrainz::{MbRelease, MbReleaseDetail, MbTrack};

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
    assert_eq!(summary.info_count, 2);
}
