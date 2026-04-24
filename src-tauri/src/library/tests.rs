use crate::library::*;
use crate::library::{delete::delete_tracks, import::compute_library_dest, scan::upsert_track, types::TrackData};
use rusqlite::Connection;
use std::path::Path;

fn test_db() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .unwrap();
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
            play_count INTEGER NOT NULL DEFAULT 0
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
        file_path: overrides.file_path.unwrap_or_else(|| "/m/song.mp3".to_string()),
        file_name: overrides.file_name.unwrap_or_else(|| "song.mp3".to_string()),
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
        artist: Some("Artist1".to_string()),
        album: None,
        genre: None,
        search: None,
        sort_by: None,
        sort_direction: None,
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
        artist: Some("Beatles".to_string()),
        genre: None,
        album: None,
        search: None,
        sort_by: None,
        sort_direction: None,
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
    assert_eq!(dest.file_name().unwrap().to_str().unwrap(), "01-01 Intro.mp3");
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
    assert_eq!(dest.file_name().unwrap().to_str().unwrap(), "01-05 Track.flac");
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
    assert_eq!(dest.file_name().unwrap().to_str().unwrap(), "01-03 What_Is_This_.flac");
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
        assert!(name.ends_with(ext), "Expected extension .{}, got {}", ext, name);
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
            artist: None, album: None, genre: None, search: None, sort_by: None, sort_direction: None,
        },
    ).unwrap();
    assert_eq!(tracks.len(), 1);
    let id = tracks[0].id;

    delete_tracks(&conn, root.to_str().unwrap(), &[id]).unwrap();

    // File should be gone
    assert!(!file_path.exists());

    // DB record should be gone
    let remaining = get_tracks(
        &conn,
        &LibraryFilter {
            artist: None, album: None, genre: None, search: None, sort_by: None, sort_direction: None,
        },
    ).unwrap();
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
            artist: None, album: None, genre: None, search: None, sort_by: None, sort_direction: None,
        },
    ).unwrap()[0].id;

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
    insert_test_track(&conn, file1.to_str().unwrap(), "Song1", "Artist", "Album", "Rock", 2020);
    insert_test_track(&conn, file2.to_str().unwrap(), "Song2", "Artist", "Album", "Rock", 2020);

    let tracks = get_tracks(
        &conn,
        &LibraryFilter {
            artist: None, album: None, genre: None, search: None, sort_by: None, sort_direction: None,
        },
    ).unwrap();
    let id = tracks[0].id;

    delete_tracks(&conn, root.to_str().unwrap(), &[id]).unwrap();

    // Album folder should still exist — one track remains
    assert!(album_dir.exists());
    assert!(album_dir.join("cover.jpg").exists());

    let remaining = get_tracks(
        &conn,
        &LibraryFilter {
            artist: None, album: None, genre: None, search: None, sort_by: None, sort_direction: None,
        },
    ).unwrap();
    assert_eq!(remaining.len(), 1);
}
