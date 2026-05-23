use super::*;
use rusqlite::Connection;
use std::fs;

fn setup_db() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "PRAGMA foreign_keys=ON;
        CREATE TABLE tracks (
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
            lyrics_not_found INTEGER NOT NULL DEFAULT 0,
            replay_gain_track_db REAL,
            replay_gain_album_db REAL
        );
        CREATE TABLE playlists (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            created_at INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE playlist_tracks (
            id INTEGER PRIMARY KEY,
            playlist_id INTEGER NOT NULL,
            track_id INTEGER NOT NULL,
            position INTEGER NOT NULL,
            FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
            FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE,
            UNIQUE(playlist_id, track_id)
        );
        CREATE TABLE smart_playlists (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            icon TEXT,
            rules_json TEXT NOT NULL,
            sort_by TEXT,
            sort_direction TEXT,
            track_limit INTEGER,
            is_builtin INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL DEFAULT 0
        );",
    )
    .unwrap();
    conn
}

fn insert_track(conn: &Connection, id: i64, path: &str, title: &str, artist: &str) {
    conn.execute(
        "INSERT INTO tracks (id, file_path, file_name, folder_path, title, artist, album, genre, format, rating, play_count)
         VALUES (?1, ?2, ?3, '/music', ?4, ?5, 'Album', 'Rock', 'FLAC', 4, 10)",
        rusqlite::params![id, path, format!("{}.flac", title.to_lowercase()), title, artist],
    )
    .unwrap();
}

fn temp_dir() -> std::path::PathBuf {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let id = COUNTER.fetch_add(1, Ordering::SeqCst);
    let dir =
        std::env::temp_dir().join(format!("crate_export_test_{}_{}", std::process::id(), id,));
    fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn export_empty_library() {
    let dir = temp_dir();
    let conn = setup_db();
    let path = dir.join("export.json");
    let result = export_library(&conn, path.to_str().unwrap()).unwrap();

    assert_eq!(result.track_count, 0);
    assert_eq!(result.playlist_count, 0);
    assert_eq!(result.smart_playlist_count, 0);
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn export_tracks_roundtrip() {
    let dir = temp_dir();
    let conn = setup_db();
    insert_track(&conn, 1, "/music/song1.flac", "Song 1", "Artist A");
    insert_track(&conn, 2, "/music/song2.flac", "Song 2", "Artist B");

    let path = dir.join("export.json");
    let result = export_library(&conn, path.to_str().unwrap()).unwrap();

    assert_eq!(result.track_count, 2);
    assert!(result.file_size > 0);

    // Verify file content deserializes back
    let content = fs::read_to_string(&path).unwrap();
    let data: LibraryExportData = serde_json::from_str(&content).unwrap();
    assert_eq!(data.tracks.len(), 2);

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn export_includes_playlists() {
    let dir = temp_dir();
    let conn = setup_db();
    insert_track(&conn, 1, "/music/song1.flac", "Song 1", "Artist A");

    conn.execute(
        "INSERT INTO playlists (id, name, created_at, updated_at) VALUES (1, 'My Playlist', 0, 0)",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (1, 1, 0)",
        [],
    )
    .unwrap();

    let path = dir.join("export.json");
    let result = export_library(&conn, path.to_str().unwrap()).unwrap();

    assert_eq!(result.playlist_count, 1);

    let content = fs::read_to_string(&path).unwrap();
    let data: LibraryExportData = serde_json::from_str(&content).unwrap();
    assert_eq!(data.playlists[0].name, "My Playlist");
    assert_eq!(data.playlists[0].tracks.len(), 1);

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn export_includes_smart_playlists() {
    let dir = temp_dir();
    let conn = setup_db();
    conn.execute(
        "INSERT INTO smart_playlists (id, name, rules_json, is_builtin, created_at, updated_at)
         VALUES (1, 'Recent', '{\"match\":\"all\",\"rules\":[]}', 1, 0, 0)",
        [],
    )
    .unwrap();

    let path = dir.join("export.json");
    let result = export_library(&conn, path.to_str().unwrap()).unwrap();

    assert_eq!(result.smart_playlist_count, 1);
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn export_to_nonexistent_dir_fails() {
    let conn = setup_db();
    let result = export_library(&conn, "/nonexistent/dir/export.json");
    assert!(result.is_err());
}

// ── Import tests ───────────────────────────────────────────

fn export_then_path(conn: &Connection) -> (std::path::PathBuf, std::path::PathBuf) {
    let dir = temp_dir();
    let path = dir.join("export.json");
    export_library(conn, path.to_str().unwrap()).unwrap();
    (dir, path)
}

#[test]
fn import_restores_ratings_and_play_counts() {
    let conn = setup_db();
    insert_track(&conn, 1, "/music/song1.flac", "Song 1", "Artist A");
    insert_track(&conn, 2, "/music/song2.flac", "Song 2", "Artist B");

    let (dir, path) = export_then_path(&conn);

    // Reset ratings and play counts
    conn.execute(
        "UPDATE tracks SET rating = 0, play_count = 0, flagged = 0",
        [],
    )
    .unwrap();

    let result = import_library(&conn, path.to_str().unwrap()).unwrap();
    assert_eq!(result.tracks_updated, 2);
    assert_eq!(result.tracks_skipped, 0);

    // Verify restored values
    let rating: i64 = conn
        .query_row(
            "SELECT rating FROM tracks WHERE file_path = '/music/song1.flac'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(rating, 4);

    let play_count: i64 = conn
        .query_row(
            "SELECT play_count FROM tracks WHERE file_path = '/music/song1.flac'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(play_count, 10);

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn import_skips_missing_tracks() {
    let conn = setup_db();
    insert_track(&conn, 1, "/music/song1.flac", "Song 1", "Artist A");

    let (dir, path) = export_then_path(&conn);

    // Remove the track from DB so it won't match
    conn.execute("DELETE FROM tracks", []).unwrap();

    let result = import_library(&conn, path.to_str().unwrap()).unwrap();
    assert_eq!(result.tracks_updated, 0);
    assert_eq!(result.tracks_skipped, 1);

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn import_creates_playlists() {
    let conn = setup_db();
    insert_track(&conn, 1, "/music/song1.flac", "Song 1", "Artist A");

    // Create a playlist and export
    conn.execute(
        "INSERT INTO playlists (id, name, created_at, updated_at) VALUES (1, 'My Playlist', 0, 0)",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (1, 1, 0)",
        [],
    )
    .unwrap();

    let (dir, path) = export_then_path(&conn);

    // Remove the playlist so import can recreate it
    conn.execute("DELETE FROM playlist_tracks", []).unwrap();
    conn.execute("DELETE FROM playlists", []).unwrap();

    let result = import_library(&conn, path.to_str().unwrap()).unwrap();
    assert_eq!(result.playlists_imported, 1);
    assert_eq!(result.playlists_skipped, 0);

    // Verify playlist was recreated with tracks
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM playlists WHERE name = 'My Playlist'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(count, 1);

    let track_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM playlist_tracks pt JOIN playlists p ON p.id = pt.playlist_id WHERE p.name = 'My Playlist'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(track_count, 1);

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn import_skips_existing_playlists() {
    let conn = setup_db();
    insert_track(&conn, 1, "/music/song1.flac", "Song 1", "Artist A");

    conn.execute(
        "INSERT INTO playlists (id, name, created_at, updated_at) VALUES (1, 'My Playlist', 0, 0)",
        [],
    )
    .unwrap();

    let (dir, path) = export_then_path(&conn);

    // Playlist still exists — import should skip it
    let result = import_library(&conn, path.to_str().unwrap()).unwrap();
    assert_eq!(result.playlists_skipped, 1);
    assert_eq!(result.playlists_imported, 0);

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn import_creates_smart_playlists() {
    let conn = setup_db();

    // Create a non-builtin smart playlist
    conn.execute(
        "INSERT INTO smart_playlists (id, name, rules_json, is_builtin, created_at, updated_at)
         VALUES (1, 'Custom SP', '{\"match\":\"all\",\"rules\":[]}', 0, 0, 0)",
        [],
    )
    .unwrap();

    let (dir, path) = export_then_path(&conn);

    // Remove so import can recreate
    conn.execute("DELETE FROM smart_playlists", []).unwrap();

    let result = import_library(&conn, path.to_str().unwrap()).unwrap();
    assert_eq!(result.smart_playlists_imported, 1);
    assert_eq!(result.smart_playlists_skipped, 0);

    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM smart_playlists WHERE name = 'Custom SP'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(count, 1);

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn import_nonexistent_file_fails() {
    let conn = setup_db();
    let result = import_library(&conn, "/nonexistent/backup.json");
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("File not found"));
}
