use crate::library::*;
use crate::library::{scan::upsert_track, types::TrackData};
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

fn insert_test_track(
    conn: &Connection,
    path: &str,
    title: &str,
    artist: &str,
    album: &str,
    genre: &str,
    year: u32,
) {
    let t = TrackData {
        file_path: path.to_string(),
        file_name: Path::new(path)
            .file_name()
            .unwrap()
            .to_string_lossy()
            .to_string(),
        folder_path: Path::new(path)
            .parent()
            .unwrap()
            .to_string_lossy()
            .to_string(),
        title: Some(title.to_string()),
        artist: Some(artist.to_string()),
        album: Some(album.to_string()),
        album_artist: None,
        sort_artist: None,
        sort_album_artist: None,
        track_number: Some(1),
        track_total: None,
        disc_number: None,
        disc_total: None,
        year: Some(year),
        genre: Some(genre.to_string()),
        duration_secs: 180.0,
        sample_rate: Some(44100),
        bitrate_kbps: Some(320),
        format: "MP3".to_string(),
        file_size: 5_000_000,
    };
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
