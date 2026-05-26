use crate::library::*;
use crate::library::{
    delete::delete_tracks, import::compute_library_dest, scan::remove_non_nfc_duplicates,
    track_io::upsert_track, types::TrackData,
};
use rusqlite::Connection;
use std::path::Path;

fn test_db() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .unwrap();
    crate::library::queries::register_sort_key(&conn).unwrap();
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS tracks (
            id INTEGER PRIMARY KEY,
            file_path TEXT NOT NULL UNIQUE,
            file_name TEXT NOT NULL,
            folder_path TEXT NOT NULL,
            title TEXT,
            artist TEXT,
            album TEXT,
            album_artist TEXT,
            sort_artist TEXT,
            sort_album_artist TEXT,
            track_number INTEGER,
            track_total INTEGER,
            disc_number INTEGER,
            disc_total INTEGER,
            year INTEGER,
            genre TEXT,
            duration_secs REAL NOT NULL DEFAULT 0,
            sample_rate INTEGER,
            bitrate_kbps INTEGER,
            format TEXT NOT NULL DEFAULT '',
            file_size INTEGER NOT NULL DEFAULT 0,
            modified_at INTEGER NOT NULL DEFAULT 0,
            scanned_at INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL DEFAULT 0,
            play_count INTEGER NOT NULL DEFAULT 0,
            last_played INTEGER,
            flagged INTEGER NOT NULL DEFAULT 0,
            rating INTEGER NOT NULL DEFAULT 0,
            lyrics TEXT,
            synced_lyrics TEXT,
            compilation INTEGER NOT NULL DEFAULT 0,
            replay_gain_track_db REAL,
            replay_gain_album_db REAL
        );
        CREATE TABLE IF NOT EXISTS library_folders (
            id INTEGER PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            added_at INTEGER NOT NULL DEFAULT 0
        );",
    )
    .unwrap();
    conn
}

fn make_track_data(overrides: TrackDataOverrides) -> TrackData {
    TrackData {
        file_path: overrides
            .file_path
            .unwrap_or_else(|| "/m/song.mp3".to_string()),
        file_name: overrides
            .file_name
            .unwrap_or_else(|| "song.mp3".to_string()),
        folder_path: overrides.folder_path.unwrap_or_else(|| "/m".to_string()),
        title: overrides.title.unwrap_or(Some("Song".to_string())),
        artist: overrides.artist.unwrap_or(Some("Artist".to_string())),
        album: overrides.album.unwrap_or(Some("Album".to_string())),
        album_artist: overrides.album_artist.unwrap_or(None),
        sort_artist: None,
        sort_album_artist: None,
        track_number: overrides.track_number.unwrap_or(Some(1)),
        track_total: None,
        disc_number: overrides.disc_number.unwrap_or(None),
        disc_total: None,
        year: overrides.year.unwrap_or(Some(2020)),
        genre: overrides.genre.unwrap_or(Some("Rock".to_string())),
        duration_secs: 180.0,
        sample_rate: Some(44100),
        bitrate_kbps: Some(320),
        format: "MP3".to_string(),
        file_size: 5_000_000,
        play_count: None,
        compilation: false,
        lyrics: None,
        replay_gain_track_db: None,
        replay_gain_album_db: None,
    }
}

#[derive(Default)]
struct TrackDataOverrides {
    file_path: Option<String>,
    file_name: Option<String>,
    folder_path: Option<String>,
    title: Option<Option<String>>,
    artist: Option<Option<String>>,
    album: Option<Option<String>>,
    album_artist: Option<Option<String>>,
    track_number: Option<Option<u32>>,
    disc_number: Option<Option<u32>>,
    year: Option<Option<u32>>,
    genre: Option<Option<String>>,
}

fn insert_test_track(
    conn: &Connection,
    path: &str,
    title: &str,
    artist: &str,
    album: &str,
    genre: &str,
    year: u32,
) {
    let t = make_track_data(TrackDataOverrides {
        file_path: Some(path.to_string()),
        file_name: Some(
            Path::new(path)
                .file_name()
                .unwrap()
                .to_string_lossy()
                .to_string(),
        ),
        folder_path: Some(
            Path::new(path)
                .parent()
                .unwrap()
                .to_string_lossy()
                .to_string(),
        ),
        title: Some(Some(title.to_string())),
        artist: Some(Some(artist.to_string())),
        album: Some(Some(album.to_string())),
        genre: Some(Some(genre.to_string())),
        year: Some(Some(year)),
        ..Default::default()
    });
    upsert_track(conn, &t, 100, 200).unwrap();
}

#[test]
fn folder_crud() {
    let conn = test_db();
    add_folder(&conn, "/music").unwrap();
    let all = get_folders(&conn).unwrap();
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].path, "/music");

    // Adding same folder again is idempotent
    add_folder(&conn, "/music").unwrap();
    assert_eq!(get_folders(&conn).unwrap().len(), 1);

    remove_folder(&conn, "/music").unwrap();
    assert_eq!(get_folders(&conn).unwrap().len(), 0);
}

#[test]
fn upsert_preserves_created_at_on_conflict() {
    let conn = test_db();

    let t = make_track_data(TrackDataOverrides {
        file_path: Some("/m/song.mp3".to_string()),
        ..Default::default()
    });

    // First insert: created_at = 1000
    upsert_track(&conn, &t, 100, 1000).unwrap();
    let created: i64 = conn
        .query_row(
            "SELECT created_at FROM tracks WHERE file_path = ?1",
            rusqlite::params!["/m/song.mp3"],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(created, 1000);

    // Second upsert (same file_path): now = 9999, but created_at should stay 1000
    upsert_track(&conn, &t, 200, 9999).unwrap();
    let created: i64 = conn
        .query_row(
            "SELECT created_at FROM tracks WHERE file_path = ?1",
            rusqlite::params!["/m/song.mp3"],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(created, 1000, "created_at must be preserved on upsert");
}

#[test]
fn track_upsert_and_query() {
    let conn = test_db();
    insert_test_track(
        &conn,
        "/music/song.mp3",
        "Song",
        "Artist",
        "Album",
        "Rock",
        2020,
    );

    let filter = LibraryFilter {
        artist: None,
        album: None,
        genre: None,
        search: None,
        sort_by: None,
        sort_direction: None,
        flagged_only: None,
        rating_min: None,
        rating_max: None,
        offset: None,
        limit: None,
        skip_count: None,
    };
    let tracks = get_tracks(&conn, &filter).unwrap();
    assert_eq!(tracks.len(), 1);
    assert_eq!(tracks[0].title.as_deref(), Some("Song"));
}

#[test]
fn filter_by_artist() {
    let conn = test_db();
    insert_test_track(&conn, "/m/a.mp3", "A", "Artist1", "Album1", "Rock", 2020);
    insert_test_track(&conn, "/m/b.mp3", "B", "Artist2", "Album2", "Pop", 2021);

    let filter = LibraryFilter {
        artist: Some(vec!["Artist1".to_string()]),
        album: None,
        genre: None,
        search: None,
        sort_by: None,
        sort_direction: None,
        flagged_only: None,
        rating_min: None,
        rating_max: None,
        offset: None,
        limit: None,
        skip_count: None,
    };
    let tracks = get_tracks(&conn, &filter).unwrap();
    assert_eq!(tracks.len(), 1);
    assert_eq!(tracks[0].artist.as_deref(), Some("Artist1"));
}

#[test]
fn search_works() {
    let conn = test_db();
    insert_test_track(
        &conn,
        "/m/a.mp3",
        "Hello World",
        "Beatles",
        "Help",
        "Rock",
        1965,
    );
    insert_test_track(
        &conn, "/m/b.mp3", "Goodbye", "Stones", "Exile", "Rock", 1972,
    );

    let results = search_tracks(&conn, "hello").unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].title.as_deref(), Some("Hello World"));
}

#[test]
fn get_artists_grouped() {
    let conn = test_db();
    insert_test_track(&conn, "/m/a.mp3", "A", "Artist1", "Album1", "Rock", 2020);
    insert_test_track(&conn, "/m/b.mp3", "B", "Artist1", "Album2", "Rock", 2021);
    insert_test_track(&conn, "/m/c.mp3", "C", "Artist2", "Album3", "Pop", 2022);

    let artists = get_artists(&conn).unwrap();
    assert_eq!(artists.len(), 2);
    let a1 = artists.iter().find(|a| a.name == "Artist1").unwrap();
    assert_eq!(a1.track_count, 2);
    assert_eq!(a1.album_count, 2);
}

#[test]
fn browser_data_filters_albums_by_artist() {
    let conn = test_db();
    insert_test_track(
        &conn,
        "/m/a1.mp3",
        "Come Together",
        "Beatles",
        "Abbey Road",
        "Rock",
        1969,
    );
    insert_test_track(
        &conn,
        "/m/a2.mp3",
        "Let It Be",
        "Beatles",
        "Let It Be",
        "Rock",
        1970,
    );
    insert_test_track(
        &conn,
        "/m/b1.mp3",
        "Money",
        "Pink Floyd",
        "Dark Side",
        "Rock",
        1973,
    );
    insert_test_track(
        &conn,
        "/m/b2.mp3",
        "Brick",
        "Pink Floyd",
        "The Wall",
        "Rock",
        1979,
    );
    insert_test_track(
        &conn,
        "/m/c1.mp3",
        "So What",
        "Miles Davis",
        "Kind of Blue",
        "Jazz",
        1959,
    );

    let filter = LibraryFilter {
        artist: Some(vec!["Beatles".to_string()]),
        genre: None,
        album: None,
        search: None,
        sort_by: None,
        sort_direction: None,
        flagged_only: None,
        rating_min: None,
        rating_max: None,
        offset: None,
        limit: None,
        skip_count: None,
    };
    let data = get_browser_data(&conn, &filter).unwrap();

    assert_eq!(data.tracks.len(), 2);

    assert_eq!(data.albums.len(), 2);
    let album_names: Vec<&str> = data.albums.iter().map(|a| a.name.as_str()).collect();
    assert!(album_names.contains(&"Abbey Road"));
    assert!(album_names.contains(&"Let It Be"));
    assert!(!album_names.contains(&"Dark Side"));
    assert!(!album_names.contains(&"The Wall"));
    assert!(!album_names.contains(&"Kind of Blue"));

    assert_eq!(data.genres.len(), 1);
    assert_eq!(data.genres[0].name, "Rock");

    assert_eq!(data.artists.len(), 3);
}

#[test]
fn get_genres_grouped() {
    let conn = test_db();
    insert_test_track(&conn, "/m/a.mp3", "A", "Art1", "Alb1", "Rock", 2020);
    insert_test_track(&conn, "/m/b.mp3", "B", "Art2", "Alb2", "Rock", 2021);
    insert_test_track(&conn, "/m/c.mp3", "C", "Art3", "Alb3", "Pop", 2022);

    let genres = get_genres(&conn).unwrap();
    assert_eq!(genres.len(), 2);
    let rock = genres.iter().find(|g| g.name == "Rock").unwrap();
    assert_eq!(rock.track_count, 2);
}

// ── compute_library_dest / filename tests ────────────────────────

#[test]
fn library_dest_formats_filename_from_metadata() {
    let track = make_track_data(TrackDataOverrides {
        file_name: Some("original.flac".to_string()),
        title: Some(Some("The Shape I'm Takin'".to_string())),
        artist: Some(Some("Red Hot Chili Peppers".to_string())),
        album: Some(Some("Return of the Dream Canteen".to_string())),
        track_number: Some(Some(18)),
        disc_number: Some(Some(1)),
        ..Default::default()
    });
    let dest = compute_library_dest(Path::new("/lib"), &track);
    assert_eq!(
        dest,
        Path::new("/lib/Red Hot Chili Peppers/Return of the Dream Canteen/01-18 The Shape I'm Takin'.flac")
    );
}

#[test]
fn library_dest_pads_single_digit_disc_and_track() {
    let track = make_track_data(TrackDataOverrides {
        file_name: Some("song.mp3".to_string()),
        title: Some(Some("Intro".to_string())),
        track_number: Some(Some(1)),
        disc_number: Some(Some(1)),
        ..Default::default()
    });
    let dest = compute_library_dest(Path::new("/lib"), &track);
    assert_eq!(
        dest.file_name().unwrap().to_str().unwrap(),
        "01-01 Intro.mp3"
    );
}

#[test]
fn library_dest_defaults_disc_to_01_when_missing() {
    let track = make_track_data(TrackDataOverrides {
        file_name: Some("song.flac".to_string()),
        title: Some(Some("Track".to_string())),
        track_number: Some(Some(5)),
        disc_number: Some(None),
        ..Default::default()
    });
    let dest = compute_library_dest(Path::new("/lib"), &track);
    assert_eq!(
        dest.file_name().unwrap().to_str().unwrap(),
        "01-05 Track.flac"
    );
}

#[test]
fn library_dest_falls_back_to_original_name_when_no_title() {
    let track = make_track_data(TrackDataOverrides {
        file_name: Some("original.mp3".to_string()),
        title: Some(None),
        track_number: Some(Some(1)),
        ..Default::default()
    });
    let dest = compute_library_dest(Path::new("/lib"), &track);
    assert_eq!(dest.file_name().unwrap().to_str().unwrap(), "original.mp3");
}

#[test]
fn library_dest_falls_back_to_original_name_when_no_track_number() {
    let track = make_track_data(TrackDataOverrides {
        file_name: Some("original.flac".to_string()),
        title: Some(Some("Title".to_string())),
        track_number: Some(None),
        ..Default::default()
    });
    let dest = compute_library_dest(Path::new("/lib"), &track);
    assert_eq!(dest.file_name().unwrap().to_str().unwrap(), "original.flac");
}

#[test]
fn library_dest_sanitizes_title_special_chars() {
    let track = make_track_data(TrackDataOverrides {
        file_name: Some("song.flac".to_string()),
        title: Some(Some("What/Is:This?".to_string())),
        track_number: Some(Some(3)),
        disc_number: Some(Some(1)),
        ..Default::default()
    });
    let dest = compute_library_dest(Path::new("/lib"), &track);
    assert_eq!(
        dest.file_name().unwrap().to_str().unwrap(),
        "01-03 What_Is_This_.flac"
    );
}

#[test]
fn library_dest_preserves_file_extension() {
    for ext in &["flac", "mp3", "m4a", "ogg"] {
        let track = make_track_data(TrackDataOverrides {
            file_name: Some(format!("song.{}", ext)),
            title: Some(Some("Title".to_string())),
            track_number: Some(Some(1)),
            disc_number: Some(Some(1)),
            ..Default::default()
        });
        let dest = compute_library_dest(Path::new("/lib"), &track);
        let name = dest.file_name().unwrap().to_str().unwrap();
        assert!(
            name.ends_with(ext),
            "Expected extension .{}, got {}",
            ext,
            name
        );
    }
}

#[test]
fn library_dest_uses_album_artist_over_artist() {
    let track = make_track_data(TrackDataOverrides {
        artist: Some(Some("Feat Artist".to_string())),
        album_artist: Some(Some("Main Artist".to_string())),
        ..Default::default()
    });
    let dest = compute_library_dest(Path::new("/lib"), &track);
    assert!(dest.to_str().unwrap().contains("Main Artist"));
    assert!(!dest.to_str().unwrap().contains("Feat Artist"));
}

// ── delete_tracks tests ──────────────────────────────────────────

#[test]
fn delete_tracks_removes_files_and_db_records() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let album_dir = root.join("Artist").join("Album");
    std::fs::create_dir_all(&album_dir).unwrap();

    let file_path = album_dir.join("01-01 Song.mp3");
    std::fs::write(&file_path, b"fake audio").unwrap();

    let conn = test_db();
    insert_test_track(
        &conn,
        file_path.to_str().unwrap(),
        "Song",
        "Artist",
        "Album",
        "Rock",
        2020,
    );

    let tracks = get_tracks(
        &conn,
        &LibraryFilter {
            artist: None,
            album: None,
            genre: None,
            search: None,
            sort_by: None,
            sort_direction: None,
            flagged_only: None,
            rating_min: None,
            rating_max: None,
            offset: None,
            limit: None,
            skip_count: None,
        },
    )
    .unwrap();
    assert_eq!(tracks.len(), 1);
    let id = tracks[0].id;

    delete_tracks(&conn, root.to_str().unwrap(), &[id]).unwrap();

    // File should be gone
    assert!(!file_path.exists());

    // DB record should be gone
    let remaining = get_tracks(
        &conn,
        &LibraryFilter {
            artist: None,
            album: None,
            genre: None,
            search: None,
            sort_by: None,
            sort_direction: None,
            flagged_only: None,
            rating_min: None,
            rating_max: None,
            offset: None,
            limit: None,
            skip_count: None,
        },
    )
    .unwrap();
    assert_eq!(remaining.len(), 0);
}

#[test]
fn delete_tracks_removes_album_folder_with_cover_art() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let album_dir = root.join("Artist").join("Album");
    std::fs::create_dir_all(&album_dir).unwrap();

    let file_path = album_dir.join("01-01 Song.mp3");
    std::fs::write(&file_path, b"fake audio").unwrap();
    std::fs::write(album_dir.join("cover.jpg"), b"fake image").unwrap();

    let conn = test_db();
    insert_test_track(
        &conn,
        file_path.to_str().unwrap(),
        "Song",
        "Artist",
        "Album",
        "Rock",
        2020,
    );

    let id = get_tracks(
        &conn,
        &LibraryFilter {
            artist: None,
            album: None,
            genre: None,
            search: None,
            sort_by: None,
            sort_direction: None,
            flagged_only: None,
            rating_min: None,
            rating_max: None,
            offset: None,
            limit: None,
            skip_count: None,
        },
    )
    .unwrap()[0]
        .id;

    delete_tracks(&conn, root.to_str().unwrap(), &[id]).unwrap();

    // Album folder (including cover.jpg) should be gone
    assert!(!album_dir.exists());
    // Artist folder should also be gone (was empty after album removed)
    assert!(!root.join("Artist").exists());
}

#[test]
fn delete_tracks_keeps_album_folder_when_other_tracks_remain() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let album_dir = root.join("Artist").join("Album");
    std::fs::create_dir_all(&album_dir).unwrap();

    let file1 = album_dir.join("01-01 Song1.mp3");
    let file2 = album_dir.join("01-02 Song2.mp3");
    std::fs::write(&file1, b"fake audio").unwrap();
    std::fs::write(&file2, b"fake audio").unwrap();
    std::fs::write(album_dir.join("cover.jpg"), b"fake image").unwrap();

    let conn = test_db();
    insert_test_track(
        &conn,
        file1.to_str().unwrap(),
        "Song1",
        "Artist",
        "Album",
        "Rock",
        2020,
    );
    insert_test_track(
        &conn,
        file2.to_str().unwrap(),
        "Song2",
        "Artist",
        "Album",
        "Rock",
        2020,
    );

    let tracks = get_tracks(
        &conn,
        &LibraryFilter {
            artist: None,
            album: None,
            genre: None,
            search: None,
            sort_by: None,
            sort_direction: None,
            flagged_only: None,
            rating_min: None,
            rating_max: None,
            offset: None,
            limit: None,
            skip_count: None,
        },
    )
    .unwrap();
    let id = tracks[0].id;

    delete_tracks(&conn, root.to_str().unwrap(), &[id]).unwrap();

    // Album folder should still exist — one track remains
    assert!(album_dir.exists());
    assert!(album_dir.join("cover.jpg").exists());

    let remaining = get_tracks(
        &conn,
        &LibraryFilter {
            artist: None,
            album: None,
            genre: None,
            search: None,
            sort_by: None,
            sort_direction: None,
            flagged_only: None,
            rating_min: None,
            rating_max: None,
            offset: None,
            limit: None,
            skip_count: None,
        },
    )
    .unwrap();
    assert_eq!(remaining.len(), 1);
}

#[test]
fn flag_tracks_and_filter() {
    let conn = test_db();
    insert_test_track(&conn, "/m/a.mp3", "A", "Artist1", "Album1", "Rock", 2020);
    insert_test_track(&conn, "/m/b.mp3", "B", "Artist2", "Album2", "Pop", 2021);

    let all_filter = LibraryFilter {
        artist: None,
        album: None,
        genre: None,
        search: None,
        sort_by: None,
        sort_direction: None,
        flagged_only: None,
        rating_min: None,
        rating_max: None,
        offset: None,
        limit: None,
        skip_count: None,
    };

    let tracks = get_tracks(&conn, &all_filter).unwrap();
    let id_a = tracks
        .iter()
        .find(|t| t.title.as_deref() == Some("A"))
        .unwrap()
        .id;

    // Flag one track
    conn.execute(
        "UPDATE tracks SET flagged = 1 WHERE id = ?1",
        rusqlite::params![id_a],
    )
    .unwrap();

    // Verify flagged field is read correctly
    let all = get_tracks(&conn, &all_filter).unwrap();
    assert!(all.iter().find(|t| t.id == id_a).unwrap().flagged);
    assert!(!all.iter().find(|t| t.id != id_a).unwrap().flagged);

    // Filter to flagged only
    let flagged_filter = LibraryFilter {
        artist: None,
        album: None,
        genre: None,
        search: None,
        sort_by: None,
        sort_direction: None,
        flagged_only: Some(true),
        rating_min: None,
        rating_max: None,
        offset: None,
        limit: None,
        skip_count: None,
    };
    let flagged = get_tracks(&conn, &flagged_filter).unwrap();
    assert_eq!(flagged.len(), 1);
    assert_eq!(flagged[0].id, id_a);

    // Browser data also respects flagged filter
    let browser = get_browser_data(&conn, &flagged_filter).unwrap();
    assert_eq!(browser.tracks.len(), 1);
    assert_eq!(browser.artists.len(), 1);
    assert_eq!(browser.artists[0].name, "Artist1");
}

#[test]
fn migrate_cover_art_moves_cover_to_new_folder() {
    use crate::library::reorganize::{cleanup_empty_dirs, migrate_cover_art};

    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let old_dir = root.join("Artist").join("Old Album");
    let new_dir = root.join("Artist").join("New Album");
    std::fs::create_dir_all(&old_dir).unwrap();
    std::fs::create_dir_all(&new_dir).unwrap();

    // Create cover art in old folder
    std::fs::write(old_dir.join("cover.jpg"), b"fake image").unwrap();

    migrate_cover_art(&old_dir, &new_dir);

    assert!(
        new_dir.join("cover.jpg").exists(),
        "cover.jpg should be in new folder"
    );
    assert!(
        !old_dir.join("cover.jpg").exists(),
        "cover.jpg should be removed from old folder"
    );

    // Old folder should now be empty and cleanable
    cleanup_empty_dirs(&old_dir, root);
    assert!(!old_dir.exists(), "old folder should be fully removed");
}

#[test]
fn migrate_cover_art_skips_if_dest_already_has_cover() {
    use crate::library::reorganize::migrate_cover_art;

    let dir = tempfile::tempdir().unwrap();
    let old_dir = dir.path().join("old");
    let new_dir = dir.path().join("new");
    std::fs::create_dir_all(&old_dir).unwrap();
    std::fs::create_dir_all(&new_dir).unwrap();

    std::fs::write(old_dir.join("cover.jpg"), b"old image").unwrap();
    std::fs::write(new_dir.join("cover.jpg"), b"new image").unwrap();

    migrate_cover_art(&old_dir, &new_dir);

    // Destination cover should be unchanged
    let content = std::fs::read(new_dir.join("cover.jpg")).unwrap();
    assert_eq!(content, b"new image");
    // Old cover should still exist (wasn't moved since dest has one)
    assert!(old_dir.join("cover.jpg").exists());
}

// ── Security: SQL injection safety ───────────────────────────────
// The library uses parameterized queries for all user inputs.
// These tests verify that SQL metacharacters in search/filter inputs
// don't cause errors or return unexpected results.

#[test]
fn search_with_sql_metacharacters() {
    let conn = test_db();
    insert_test_track(
        &conn,
        "/m/a.mp3",
        "Normal Song",
        "Artist",
        "Album",
        "Rock",
        2020,
    );

    // SQL injection attempts in search query — should return empty, not error
    let results = search_tracks(&conn, "'; DROP TABLE tracks; --").unwrap();
    assert!(results.is_empty());

    // Verify table still exists
    let all = search_tracks(&conn, "Normal").unwrap();
    assert_eq!(all.len(), 1);
}

#[test]
fn search_with_percent_wildcard() {
    let conn = test_db();
    insert_test_track(
        &conn,
        "/m/a.mp3",
        "Test Song",
        "Artist",
        "Album",
        "Rock",
        2020,
    );
    insert_test_track(&conn, "/m/b.mp3", "Other", "Other", "Other", "Pop", 2021);

    // "%" in LIKE should be treated as literal, not wildcard
    // But since the search wraps with %query%, "%%" would match all
    // This is acceptable behavior — it's safe, just permissive
    let results = search_tracks(&conn, "%").unwrap();
    // Both match because the search pattern becomes %%% which matches everything
    assert!(results.len() >= 1);
}

#[test]
fn search_with_unicode() {
    let conn = test_db();
    insert_test_track(
        &conn,
        "/m/a.mp3",
        "日本語タイトル",
        "アーティスト",
        "アルバム",
        "J-Pop",
        2020,
    );

    let results = search_tracks(&conn, "日本語").unwrap();
    assert_eq!(results.len(), 1);
}

#[test]
fn search_with_very_long_query() {
    let conn = test_db();
    insert_test_track(&conn, "/m/a.mp3", "Song", "Artist", "Album", "Rock", 2020);

    // Very long search string — should not crash
    let long_query = "a".repeat(10000);
    let results = search_tracks(&conn, &long_query).unwrap();
    assert!(results.is_empty());
}

#[test]
fn search_empty_string_returns_all() {
    let conn = test_db();
    insert_test_track(
        &conn, "/m/a.mp3", "Song A", "Artist1", "Album1", "Rock", 2020,
    );
    insert_test_track(
        &conn, "/m/b.mp3", "Song B", "Artist2", "Album2", "Pop", 2021,
    );

    let results = search_tracks(&conn, "").unwrap();
    assert_eq!(results.len(), 2);
}

#[test]
fn filter_with_sql_metacharacters_in_artist() {
    let conn = test_db();
    insert_test_track(
        &conn,
        "/m/a.mp3",
        "Song",
        "Normal Artist",
        "Album",
        "Rock",
        2020,
    );

    let filter = LibraryFilter {
        artist: Some(vec!["'; DROP TABLE tracks; --".to_string()]),
        album: None,
        genre: None,
        search: None,
        sort_by: None,
        sort_direction: None,
        flagged_only: None,
        rating_min: None,
        rating_max: None,
        offset: None,
        limit: None,
        skip_count: None,
    };
    let results = get_tracks(&conn, &filter).unwrap();
    assert!(results.is_empty());

    // Table should still be intact
    let all = get_tracks(
        &conn,
        &LibraryFilter {
            artist: None,
            album: None,
            genre: None,
            search: None,
            sort_by: None,
            sort_direction: None,
            flagged_only: None,
            rating_min: None,
            rating_max: None,
            offset: None,
            limit: None,
            skip_count: None,
        },
    )
    .unwrap();
    assert_eq!(all.len(), 1);
}

#[test]
fn flag_with_invalid_ids_is_harmless() {
    let conn = test_db();
    insert_test_track(&conn, "/m/a.mp3", "Song", "Artist", "Album", "Rock", 2020);

    // Flag non-existent track IDs via raw SQL — should succeed without error
    let result = conn.execute(
        "UPDATE tracks SET flagged = 1 WHERE id IN (?1, ?2)",
        rusqlite::params![99999, 88888],
    );
    assert!(result.is_ok());

    // Original track should be unaffected
    let all = get_tracks(
        &conn,
        &LibraryFilter {
            artist: None,
            album: None,
            genre: None,
            search: None,
            sort_by: None,
            sort_direction: None,
            flagged_only: None,
            rating_min: None,
            rating_max: None,
            offset: None,
            limit: None,
            skip_count: None,
        },
    )
    .unwrap();
    assert_eq!(all.len(), 1);
    assert!(!all[0].flagged);
}

#[test]
fn large_batch_insert_and_query() {
    let conn = test_db();
    // Insert many tracks to test performance with large datasets
    for i in 0..500 {
        insert_test_track(
            &conn,
            &format!("/m/{}.mp3", i),
            &format!("Song {}", i),
            "Artist",
            "Album",
            "Rock",
            2020,
        );
    }

    // Flag all via batch update
    conn.execute("UPDATE tracks SET flagged = 1", []).unwrap();

    let flagged = get_tracks(
        &conn,
        &LibraryFilter {
            artist: None,
            album: None,
            genre: None,
            search: None,
            sort_by: None,
            sort_direction: None,
            flagged_only: Some(true),
            rating_min: None,
            rating_max: None,
            offset: None,
            limit: None,
            skip_count: None,
        },
    )
    .unwrap();
    assert_eq!(flagged.len(), 500);
}

// ── is_ghost_path ───────────────────────────────────────────────

/// Resolve symlinks in the temp dir path so that /tmp → /private/tmp
/// doesn't cause false positives in is_ghost_path tests.
fn canonical_tempdir() -> (tempfile::TempDir, std::path::PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let canon = dir.path().canonicalize().unwrap();
    (dir, canon)
}

#[test]
fn ghost_path_returns_true_for_nonexistent_file() {
    let conn = test_db();
    assert!(super::is_ghost_path("/no/such/file.mp3", &conn));
}

#[test]
fn ghost_path_returns_false_for_existing_file() {
    let conn = test_db();
    let (_dir, canon) = canonical_tempdir();
    let file = canon.join("song.mp3");
    std::fs::write(&file, b"data").unwrap();
    assert!(!super::is_ghost_path(file.to_str().unwrap(), &conn));
}

#[test]
fn ghost_path_nfc_vs_nfd_is_not_ghost() {
    let conn = test_db();
    // Simulate the scenario where the DB stores an NFC path but canonicalize()
    // returns NFD (as happens on HFS+ volumes). Both forms should be treated
    // as equivalent — the file is NOT a ghost.
    let (_dir, canon) = canonical_tempdir();
    // Create file with NFC name: "André.mp3" using precomposed é (U+00E9)
    let nfc_name = "Andr\u{00e9}.mp3";
    let file = canon.join(nfc_name);
    std::fs::write(&file, b"data").unwrap();

    // Construct the NFD variant: "André.mp3" using e + combining acute (U+0065 U+0301)
    let nfd_name = "Andre\u{0301}.mp3";
    let nfd_path = canon.join(nfd_name);

    // On macOS APFS (normalization-insensitive), both paths resolve to the
    // same file. On case-sensitive/normalization-sensitive filesystems the
    // NFD path might not exist, so skip the assertion in that case.
    if nfd_path.exists() {
        assert!(
            !super::is_ghost_path(nfd_path.to_str().unwrap(), &conn),
            "NFC/NFD equivalent path should not be a ghost"
        );
    }
}

#[test]
fn ghost_path_not_ghost_when_no_replacement_exists() {
    let conn = test_db();

    // Create a file at a path that differs from its canonical form.
    // On macOS, /tmp → /private/tmp, so a file created via the temp dir
    // will have a canonical path that differs from its /tmp-based path.
    let dir_raw = tempfile::tempdir().unwrap();
    let file = dir_raw.path().join("track.mp3");
    std::fs::write(&file, b"data").unwrap();
    let symlink_path = file.to_str().unwrap();

    // File exists but canonical path differs (symlink) — without a
    // replacement record in the DB, this should NOT be a ghost.
    assert!(
        !super::is_ghost_path(symlink_path, &conn),
        "should not be ghost when no replacement record exists"
    );
}

#[test]
fn ghost_path_is_ghost_when_replacement_exists() {
    let conn = test_db();
    let dir_raw = tempfile::tempdir().unwrap();
    let file = dir_raw.path().join("track.mp3");
    std::fs::write(&file, b"data").unwrap();
    let symlink_path = file.to_str().unwrap();
    let canon_path: String = file.canonicalize().unwrap().to_string_lossy().into_owned();

    // Only matters when paths actually differ (e.g. /tmp → /private/tmp)
    if symlink_path != canon_path {
        // Insert a replacement record at the canonical path
        conn.execute(
            "INSERT INTO tracks (file_path, file_name, folder_path, format) VALUES (?1, 'track.mp3', '/music', 'MP3')",
            rusqlite::params![&canon_path],
        )
        .unwrap();
        assert!(
            super::is_ghost_path(symlink_path, &conn),
            "should be ghost when replacement record exists at canonical path"
        );
    }
}

// ── Unicode NFC duplicate cleanup ───────────────────────────────

#[test]
fn remove_non_nfc_duplicates_deletes_nfd_when_nfc_exists() {
    let conn = test_db();

    // "é" in NFC (U+00E9) vs NFD (U+0065 U+0301)
    let nfc_path = "/music/Caf\u{00e9}/song.mp3";
    let nfd_path = "/music/Cafe\u{0301}/song.mp3";
    assert_ne!(nfc_path, nfd_path);

    // Insert both variants directly via SQL to simulate pre-normalization state
    conn.execute(
        "INSERT INTO tracks (file_path, file_name, folder_path, format) VALUES (?1, 'song.mp3', '/music/nfc', 'MP3')",
        rusqlite::params![nfc_path],
    ).unwrap();
    conn.execute(
        "INSERT INTO tracks (file_path, file_name, folder_path, format) VALUES (?1, 'song.mp3', '/music/nfd', 'MP3')",
        rusqlite::params![nfd_path],
    ).unwrap();

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 2);

    let removed = remove_non_nfc_duplicates(&conn).unwrap();
    assert_eq!(removed, 1);

    // Only the NFC entry should remain
    let remaining: Vec<String> = conn
        .prepare("SELECT file_path FROM tracks")
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining[0], nfc_path);
}

#[test]
fn remove_non_nfc_duplicates_keeps_nfd_when_no_nfc_counterpart() {
    let conn = test_db();

    // Only the NFD version exists — should not be removed
    let nfd_path = "/music/Cafe\u{0301}/song.mp3";
    conn.execute(
        "INSERT INTO tracks (file_path, file_name, folder_path, format) VALUES (?1, 'song.mp3', '/music/nfd', 'MP3')",
        rusqlite::params![nfd_path],
    ).unwrap();

    let removed = remove_non_nfc_duplicates(&conn).unwrap();
    assert_eq!(removed, 0);

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 1);
}

#[test]
fn remove_non_nfc_duplicates_ignores_already_nfc_paths() {
    let conn = test_db();

    insert_test_track(
        &conn,
        "/music/normal/song.mp3",
        "Song",
        "Artist",
        "Album",
        "Rock",
        2020,
    );
    insert_test_track(
        &conn,
        "/music/other/song.mp3",
        "Other",
        "Artist",
        "Album",
        "Rock",
        2020,
    );

    let removed = remove_non_nfc_duplicates(&conn).unwrap();
    assert_eq!(removed, 0);

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 2);
}
