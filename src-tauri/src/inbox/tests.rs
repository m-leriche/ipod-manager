use super::checks::{check_tags, local_tracklist, quality_desc, quality_rank};
use super::filing::move_file;
use super::types::CheckStatus;
use crate::library::types::TrackData;
use std::path::Path;

fn track(
    title: Option<&str>,
    artist: Option<&str>,
    album: Option<&str>,
    track_number: Option<u32>,
    track_total: Option<u32>,
    format: &str,
    bitrate_kbps: Option<u32>,
) -> TrackData {
    TrackData {
        file_path: "/inbox/a/file.flac".into(),
        file_name: "file.flac".into(),
        folder_path: "/inbox/a".into(),
        title: title.map(String::from),
        artist: artist.map(String::from),
        album: album.map(String::from),
        album_artist: None,
        sort_artist: None,
        sort_album_artist: None,
        track_number,
        track_total,
        disc_number: None,
        disc_total: None,
        year: None,
        genre: None,
        duration_secs: 0.0,
        sample_rate: None,
        bitrate_kbps,
        format: format.into(),
        file_size: 0,
        play_count: None,
        compilation: false,
        lyrics: None,
        replay_gain_track_db: None,
        replay_gain_album_db: None,
    }
}

fn complete(n: u32, total: u32) -> TrackData {
    track(
        Some("Song"),
        Some("Artist"),
        Some("Album"),
        Some(n),
        Some(total),
        "FLAC",
        None,
    )
}

#[test]
fn tags_pass_when_complete() {
    let tracks = vec![complete(1, 2), complete(2, 2)];
    assert_eq!(check_tags(&tracks).status, CheckStatus::Pass);
}

#[test]
fn tags_fail_reports_missing_fields() {
    let tracks = vec![
        track(None, Some("A"), Some("X"), Some(1), None, "MP3", None),
        track(Some("S"), Some("A"), Some("X"), None, None, "MP3", None),
    ];
    let result = check_tags(&tracks);
    assert_eq!(result.status, CheckStatus::Fail);
    let detail = result.detail.unwrap();
    assert!(detail.contains("1 missing title"));
    assert!(detail.contains("1 missing track #"));
}

#[test]
fn tags_fail_on_inconsistent_album() {
    let tracks = vec![
        track(Some("S"), Some("A"), Some("X"), Some(1), None, "MP3", None),
        track(Some("S"), Some("A"), Some("Y"), Some(2), None, "MP3", None),
    ];
    let result = check_tags(&tracks);
    assert_eq!(result.status, CheckStatus::Fail);
    assert_eq!(result.detail.unwrap(), "Inconsistent album tags");
}

#[test]
fn tracklist_pending_when_contiguous() {
    let tracks = vec![complete(1, 3), complete(2, 3), complete(3, 3)];
    assert_eq!(local_tracklist(&tracks).status, CheckStatus::Pending);
}

#[test]
fn tracklist_fail_on_gap() {
    let tracks = vec![complete(1, 4), complete(2, 4), complete(4, 4)];
    let result = local_tracklist(&tracks);
    assert_eq!(result.status, CheckStatus::Fail);
    assert_eq!(result.detail.unwrap(), "Missing track(s) 3");
}

#[test]
fn tracklist_fail_on_gap_without_track_total() {
    let tracks = vec![
        track(Some("S"), Some("A"), Some("X"), Some(1), None, "MP3", None),
        track(Some("S"), Some("A"), Some("X"), Some(3), None, "MP3", None),
    ];
    let result = local_tracklist(&tracks);
    assert_eq!(result.status, CheckStatus::Fail);
    assert_eq!(result.detail.unwrap(), "Missing track(s) 2");
}

#[test]
fn tracklist_fail_on_duplicate_numbers() {
    let tracks = vec![complete(1, 2), complete(1, 2)];
    let result = local_tracklist(&tracks);
    assert_eq!(result.status, CheckStatus::Fail);
    assert_eq!(result.detail.unwrap(), "Duplicate track numbers");
}

#[test]
fn tracklist_fail_on_missing_numbers() {
    let tracks = vec![track(
        Some("S"),
        Some("A"),
        Some("X"),
        None,
        None,
        "MP3",
        None,
    )];
    assert_eq!(local_tracklist(&tracks).status, CheckStatus::Fail);
}

#[test]
fn quality_rank_lossless_beats_any_bitrate() {
    assert!(quality_rank("FLAC", None) > quality_rank("MP3", Some(320)));
    assert!(quality_rank("flac", None) > quality_rank("M4A", Some(999)));
}

#[test]
fn quality_rank_lossy_compares_by_bitrate() {
    assert!(quality_rank("MP3", Some(320)) > quality_rank("MP3", Some(192)));
    assert_eq!(quality_rank("MP3", None), 0);
}

#[test]
fn quality_desc_formats() {
    assert_eq!(quality_desc("FLAC", None), "FLAC");
    assert_eq!(quality_desc("mp3", Some(320)), "MP3 320 kbps");
    assert_eq!(quality_desc("MP3", None), "MP3");
}

#[test]
fn move_file_renames_and_creates_parents() {
    let tmp = tempfile::tempdir().unwrap();
    let src = tmp.path().join("src.txt");
    let dest = tmp.path().join("a/b/dest.txt");
    std::fs::write(&src, "data").unwrap();

    move_file(&src, &dest).unwrap();

    assert!(!src.exists());
    assert_eq!(std::fs::read_to_string(&dest).unwrap(), "data");
}

#[test]
fn move_file_fails_on_missing_source() {
    let tmp = tempfile::tempdir().unwrap();
    let result = move_file(Path::new("/nonexistent/file"), &tmp.path().join("dest"));
    assert!(result.is_err());
}
