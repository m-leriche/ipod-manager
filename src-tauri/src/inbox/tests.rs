use super::cache::{cache_tracklist, cached_tracklist};
use super::checks::{check_tags, local_tracklist, quality_desc, quality_rank};
use super::filing::{delete_filed_folder, file_album, move_file, undo_filing};
use super::types::{CheckResult, CheckStatus};
use crate::library::types::TrackData;
use rusqlite::Connection;
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

#[test]
fn file_and_undo_roundtrip_keeps_db_consistent_with_decomposed_unicode() {
    let tmp = tempfile::tempdir().unwrap();
    // "è" as e + combining grave (NFD) — upsert normalizes paths to NFC, so
    // the recorded move must match the normalized row exactly for undo.
    let library_root = tmp.path().join("Bibliothe\u{300}que");
    std::fs::create_dir_all(&library_root).unwrap();
    let album_dir = tmp.path().join("inbox/Album");
    std::fs::create_dir_all(&album_dir).unwrap();
    let src = album_dir.join("01 Track.flac");
    std::fs::write(&src, "not real audio").unwrap();

    let conn = crate::library::init_db(&tmp.path().join("test.db")).unwrap();

    let result = file_album(
        library_root.to_str().unwrap(),
        album_dir.to_str().unwrap(),
        &conn,
    )
    .unwrap();
    assert_eq!(result.moves.len(), 1);
    assert!(!src.exists());

    let mv = &result.moves[0];
    let rows: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tracks WHERE file_path = ?1",
            rusqlite::params![mv.to],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(rows, 1, "upserted row must match the recorded move path");

    undo_filing(&result.moves, &conn).unwrap();

    assert!(src.exists(), "file restored to inbox");
    let rows: i64 = conn
        .query_row("SELECT COUNT(*) FROM tracks", [], |r| r.get(0))
        .unwrap();
    assert_eq!(rows, 0, "undo must remove the ghost row");
}

#[test]
fn file_album_keeps_inbox_folder_for_user_confirmation() {
    let tmp = tempfile::tempdir().unwrap();
    let library_root = tmp.path().join("Library");
    std::fs::create_dir_all(&library_root).unwrap();
    let album_dir = tmp.path().join("inbox/Album");
    std::fs::create_dir_all(&album_dir).unwrap();
    std::fs::write(album_dir.join("01 Track.flac"), "not real audio").unwrap();
    std::fs::write(album_dir.join("notes.txt"), "ripped from CD").unwrap();

    let conn = crate::library::init_db(&tmp.path().join("test.db")).unwrap();

    file_album(
        library_root.to_str().unwrap(),
        album_dir.to_str().unwrap(),
        &conn,
    )
    .unwrap();

    assert!(
        album_dir.exists(),
        "file_album must leave the inbox folder so the user can confirm deletion"
    );
}

#[test]
fn delete_filed_folder_removes_folder_with_leftover_files() {
    let tmp = tempfile::tempdir().unwrap();
    let album_dir = tmp.path().join("inbox/Album");
    std::fs::create_dir_all(&album_dir).unwrap();
    std::fs::write(album_dir.join("lyrics.lrc"), "[00:00] hi").unwrap();
    std::fs::write(album_dir.join("notes.txt"), "ripped from CD").unwrap();

    delete_filed_folder(album_dir.to_str().unwrap()).unwrap();

    assert!(
        !album_dir.exists(),
        "delete_filed_folder must remove the folder and its leftover non-audio files"
    );
}

#[test]
fn delete_filed_folder_keeps_folder_with_unimported_audio() {
    let tmp = tempfile::tempdir().unwrap();
    let album_dir = tmp.path().join("inbox/Album");
    std::fs::create_dir_all(&album_dir).unwrap();
    let track = album_dir.join("01 Track.flac");
    std::fs::write(&track, "not real audio").unwrap();

    delete_filed_folder(album_dir.to_str().unwrap()).unwrap();

    assert!(
        track.exists(),
        "un-imported audio must survive — the folder is kept when audio remains"
    );
}

#[test]
fn tracklist_cache_roundtrips_definitive_verdicts() {
    let conn = Connection::open_in_memory().unwrap();
    let verdict = CheckResult::pass(Some("Matches “Album” (10 tracks)".into()));

    assert!(cached_tracklist(&conn, "Artist", "Album", 10).is_none());
    cache_tracklist(&conn, "Artist", "Album", 10, &verdict);

    let hit = cached_tracklist(&conn, "Artist", "Album", 10).unwrap();
    assert_eq!(hit.status, CheckStatus::Pass);
    assert_eq!(hit.detail.unwrap(), "Matches “Album” (10 tracks)");
}

#[test]
fn tracklist_cache_is_case_insensitive_but_count_sensitive() {
    let conn = Connection::open_in_memory().unwrap();
    cache_tracklist(&conn, "Artist", "Album", 10, &CheckResult::pass(None));

    assert!(cached_tracklist(&conn, "ARTIST", "album", 10).is_some());
    assert!(cached_tracklist(&conn, "Artist", "Album", 11).is_none());
}

#[test]
fn tracklist_cache_skips_transient_warns() {
    let conn = Connection::open_in_memory().unwrap();
    cache_tracklist(
        &conn,
        "Artist",
        "Album",
        10,
        &CheckResult::warn("Could not verify: timeout".into()),
    );
    assert!(cached_tracklist(&conn, "Artist", "Album", 10).is_none());
}

#[test]
fn direct_audio_children_ignores_non_audio_and_hidden_files() {
    let tmp = tempfile::tempdir().unwrap();
    std::fs::write(tmp.path().join("01.flac"), "x").unwrap();
    std::fs::write(tmp.path().join(".hidden.flac"), "x").unwrap();
    std::fs::write(tmp.path().join("cover.jpg"), "x").unwrap();
    std::fs::create_dir(tmp.path().join("CD2")).unwrap();

    let children = super::scan::direct_audio_children(tmp.path());
    assert_eq!(children.len(), 1);
    assert!(children[0].ends_with("01.flac"));
}
