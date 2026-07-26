use super::*;

fn make_snapshot() -> TrackMetadata {
    TrackMetadata {
        file_path: "/music/song.flac".to_string(),
        file_name: "song.flac".to_string(),
        title: Some("Old Title".to_string()),
        artist: Some("Old Artist".to_string()),
        album: Some("Old Album".to_string()),
        album_artist: Some("Old AlbumArtist".to_string()),
        sort_artist: Some("OldSort".to_string()),
        sort_album_artist: None,
        track: Some(3),
        track_total: Some(12),
        disc_number: Some(1),
        disc_total: Some(2),
        year: Some(1999),
        genre: Some("Rock".to_string()),
        compilation: Some(false),
    }
}

#[test]
fn undo_captures_only_changed_fields() {
    let update = MetadataUpdate {
        file_path: "/music/song.flac".to_string(),
        track_id: None,
        title: Some("New Title".to_string()),
        artist: None,
        album: None,
        album_artist: None,
        sort_artist: None,
        sort_album_artist: None,
        track: None,
        track_total: None,
        disc_number: None,
        disc_total: None,
        year: Some(2024),
        genre: None,
        compilation: None,
    };
    let snapshot = make_snapshot();
    let undo = build_undo_operation(&update, &snapshot);

    assert_eq!(undo.title, Some("Old Title".to_string()));
    assert_eq!(undo.year, Some(1999));
    assert!(undo.artist.is_none());
    assert!(undo.album.is_none());
    assert!(undo.track.is_none());
    assert!(undo.genre.is_none());
}

#[test]
fn undo_uses_empty_string_for_none_snapshot_fields() {
    let update = MetadataUpdate {
        file_path: "/music/song.flac".to_string(),
        track_id: None,
        title: None,
        artist: None,
        album: None,
        album_artist: None,
        sort_artist: None,
        sort_album_artist: Some("New".to_string()),
        track: None,
        track_total: None,
        disc_number: None,
        disc_total: None,
        year: None,
        genre: None,
        compilation: None,
    };
    let snapshot = make_snapshot();
    let undo = build_undo_operation(&update, &snapshot);

    // sort_album_artist was None in snapshot → undo should be empty string
    assert_eq!(undo.sort_album_artist, Some(String::new()));
}

#[test]
fn undo_preserves_file_path() {
    let update = MetadataUpdate {
        file_path: "/music/song.flac".to_string(),
        track_id: None,
        title: Some("X".to_string()),
        artist: None,
        album: None,
        album_artist: None,
        sort_artist: None,
        sort_album_artist: None,
        track: None,
        track_total: None,
        disc_number: None,
        disc_total: None,
        year: None,
        genre: None,
        compilation: None,
    };
    let snapshot = make_snapshot();
    let undo = build_undo_operation(&update, &snapshot);

    assert_eq!(undo.file_path, "/music/song.flac");
}

#[test]
fn undo_all_fields_changed() {
    let update = MetadataUpdate {
        file_path: "/music/song.flac".to_string(),
        track_id: None,
        title: Some("New".to_string()),
        artist: Some("New".to_string()),
        album: Some("New".to_string()),
        album_artist: Some("New".to_string()),
        sort_artist: Some("New".to_string()),
        sort_album_artist: Some("New".to_string()),
        track: Some(1),
        track_total: Some(10),
        disc_number: Some(2),
        disc_total: Some(3),
        year: Some(2024),
        genre: Some("Pop".to_string()),
        compilation: Some(true),
    };
    let snapshot = make_snapshot();
    let undo = build_undo_operation(&update, &snapshot);

    assert_eq!(undo.title, Some("Old Title".to_string()));
    assert_eq!(undo.artist, Some("Old Artist".to_string()));
    assert_eq!(undo.album, Some("Old Album".to_string()));
    assert_eq!(undo.album_artist, Some("Old AlbumArtist".to_string()));
    assert_eq!(undo.sort_artist, Some("OldSort".to_string()));
    assert_eq!(undo.sort_album_artist, Some(String::new()));
    assert_eq!(undo.track, Some(3));
    assert_eq!(undo.track_total, Some(12));
    assert_eq!(undo.disc_number, Some(1));
    assert_eq!(undo.disc_total, Some(2));
    assert_eq!(undo.year, Some(1999));
    assert_eq!(undo.genre, Some("Rock".to_string()));
}

fn make_test_m4a(name: &str) -> Option<std::path::PathBuf> {
    let ffmpeg_ok = std::process::Command::new("ffmpeg")
        .arg("-version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    if !ffmpeg_ok {
        eprintln!("ffmpeg not available, skipping");
        return None;
    }
    let dir = std::env::temp_dir().join("crate_write_tests");
    std::fs::create_dir_all(&dir).ok()?;
    let path = dir.join(name);
    let status = std::process::Command::new("ffmpeg")
        .args([
            "-y",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=44100:cl=mono",
            "-t",
            "1",
            "-c:a",
            "aac",
        ])
        .arg(&path)
        .status()
        .ok()?;
    status.success().then_some(path)
}

fn make_test_mp3(name: &str) -> Option<std::path::PathBuf> {
    let ffmpeg_ok = std::process::Command::new("ffmpeg")
        .arg("-version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    if !ffmpeg_ok {
        eprintln!("ffmpeg not available, skipping");
        return None;
    }
    let dir = std::env::temp_dir().join("crate_write_tests");
    std::fs::create_dir_all(&dir).ok()?;
    let path = dir.join(name);
    let status = std::process::Command::new("ffmpeg")
        .args([
            "-y",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=44100:cl=mono",
            "-t",
            "1",
            "-c:a",
            "libmp3lame",
        ])
        .arg(&path)
        .status()
        .ok()?;
    status.success().then_some(path)
}

/// Once a file has an ID3 region with padding, later edits must reuse it rather
/// than shifting the audio. A changed file length is the tell that `id3` fell
/// back to growing or shrinking the region — the slow path this avoids.
#[test]
fn mp3_edits_reuse_the_existing_tag_region() {
    let Some(path) = make_test_mp3("id3_region_reuse.mp3") else {
        return;
    };

    let mut update = year_only_update(&path, 2000);
    update.year = None;
    update.artist = Some("First Artist".to_string());
    apply_update(&update, Id3WriteVersion::V23).unwrap();
    let len_after_first = std::fs::metadata(&path).unwrap().len();

    // A longer value still has to fit the padding established above.
    update.artist = Some("A Substantially Longer Artist Name".to_string());
    apply_update(&update, Id3WriteVersion::V23).unwrap();

    assert_eq!(
        len_after_first,
        std::fs::metadata(&path).unwrap().len(),
        "second edit must land in the existing region, not move the audio"
    );
    assert_eq!(
        super::super::read::read_track(&path).artist.as_deref(),
        Some("A Substantially Longer Artist Name")
    );
}

fn year_only_update(path: &std::path::Path, year: u32) -> MetadataUpdate {
    MetadataUpdate {
        file_path: path.to_string_lossy().to_string(),
        track_id: None,
        title: None,
        artist: None,
        album: None,
        album_artist: None,
        sort_artist: None,
        sort_album_artist: None,
        track: None,
        track_total: None,
        disc_number: None,
        disc_total: None,
        year: Some(year),
        genre: None,
        compilation: None,
    }
}

#[test]
fn m4a_year_roundtrip() {
    let Some(path) = make_test_m4a("year_roundtrip.m4a") else {
        return;
    };
    apply_update(&year_only_update(&path, 1994), Id3WriteVersion::V23).unwrap();
    assert_eq!(super::super::read::read_track(&path).year, Some(1994));
}

#[test]
fn m4a_year_via_ffmpeg_fallback() {
    let Some(path) = make_test_m4a("year_ffmpeg_fallback.m4a") else {
        return;
    };
    apply_update_ffmpeg(&path, &year_only_update(&path, 2001)).unwrap();
    assert_eq!(super::super::read::read_track(&path).year, Some(2001));
}
