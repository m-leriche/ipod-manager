use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

use super::playlists;
use super::smart_playlists;
use super::types::{Playlist, SmartPlaylist};

// ── Types ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryExportData {
    pub exported_at: String,
    pub tracks: Vec<ExportTrack>,
    pub playlists: Vec<ExportPlaylist>,
    pub smart_playlists: Vec<SmartPlaylist>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportTrack {
    pub file_path: String,
    pub file_name: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub genre: Option<String>,
    pub year: Option<u32>,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub format: String,
    pub rating: u8,
    pub play_count: u32,
    pub flagged: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportPlaylist {
    pub name: String,
    pub tracks: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExportResult {
    pub path: String,
    pub track_count: usize,
    pub playlist_count: usize,
    pub smart_playlist_count: usize,
    pub file_size: u64,
}

// ── Export ───────────────────────────────────────────────────────

pub fn export_library(conn: &Connection, output_path: &str) -> Result<ExportResult, String> {
    let dest = Path::new(output_path);
    if let Some(parent) = dest.parent() {
        if !parent.exists() {
            return Err(format!(
                "Directory does not exist: {}",
                parent.to_string_lossy()
            ));
        }
    }

    // Export tracks
    let tracks = export_tracks(conn)?;
    let track_count = tracks.len();

    // Export playlists with track file paths
    let playlists_data = playlists::get_playlists(conn)?;
    let playlists = export_playlists(conn, &playlists_data)?;
    let playlist_count = playlists.len();

    // Export smart playlists
    let smart = smart_playlists::get_smart_playlists(conn)?;
    let smart_playlist_count = smart.len();

    let now = iso8601_now();

    let data = LibraryExportData {
        exported_at: now,
        tracks,
        playlists,
        smart_playlists: smart,
    };

    let json = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("JSON serialization failed: {}", e))?;

    fs::write(dest, &json).map_err(|e| format!("Failed to write export file: {}", e))?;

    let file_size = json.len() as u64;

    Ok(ExportResult {
        path: output_path.to_string(),
        track_count,
        playlist_count,
        smart_playlist_count,
        file_size,
    })
}

// ── Helpers ─────────────────────────────────────────────────────

fn export_tracks(conn: &Connection) -> Result<Vec<ExportTrack>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT file_path, file_name, title, artist, album, album_artist, genre,
                    year, track_number, disc_number, format, rating, play_count, flagged
             FROM tracks ORDER BY file_path",
        )
        .map_err(|e| format!("DB error: {}", e))?;

    let rows = stmt
        .query_map([], |r| {
            Ok(ExportTrack {
                file_path: r.get(0)?,
                file_name: r.get(1)?,
                title: r.get(2)?,
                artist: r.get(3)?,
                album: r.get(4)?,
                album_artist: r.get(5)?,
                genre: r.get(6)?,
                year: r.get(7)?,
                track_number: r.get(8)?,
                disc_number: r.get(9)?,
                format: r.get::<_, Option<String>>(10)?.unwrap_or_default(),
                rating: r.get::<_, i64>(11).map(|v| v as u8)?,
                play_count: r.get::<_, i64>(12).map(|v| v as u32)?,
                flagged: r.get(13)?,
            })
        })
        .map_err(|e| format!("DB error: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row read failed: {}", e))
}

fn export_playlists(
    conn: &Connection,
    playlists_data: &[Playlist],
) -> Result<Vec<ExportPlaylist>, String> {
    let mut result = Vec::with_capacity(playlists_data.len());

    for pl in playlists_data {
        let tracks = playlists::get_playlist_tracks(conn, pl.id)?;
        let track_paths: Vec<String> = tracks.into_iter().map(|pt| pt.track.file_path).collect();
        result.push(ExportPlaylist {
            name: pl.name.clone(),
            tracks: track_paths,
        });
    }

    Ok(result)
}

fn iso8601_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Convert epoch seconds to ISO 8601 UTC without external crates
    let days = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    // Days since 1970-01-01 → year/month/day
    let (year, month, day) = days_to_ymd(days);

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hours, minutes, seconds
    )
}

fn days_to_ymd(mut days: u64) -> (u64, u64, u64) {
    // Algorithm from http://howardhinnant.github.io/date_algorithms.html
    days += 719468;
    let era = days / 146097;
    let doe = days - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;

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
                flagged INTEGER NOT NULL DEFAULT 0,
                rating INTEGER NOT NULL DEFAULT 0,
                lyrics TEXT,
                synced_lyrics TEXT,
                lyrics_not_found INTEGER NOT NULL DEFAULT 0
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
}
