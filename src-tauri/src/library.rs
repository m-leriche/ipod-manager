use crate::audio_utils::collect_audio_files;
use lofty::prelude::{Accessor, AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::ItemKey;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

// ── Types ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryTrack {
    pub id: i64,
    pub file_path: String,
    pub file_name: String,
    pub folder_path: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub sort_artist: Option<String>,
    pub sort_album_artist: Option<String>,
    pub track_number: Option<u32>,
    pub track_total: Option<u32>,
    pub disc_number: Option<u32>,
    pub year: Option<u32>,
    pub genre: Option<String>,
    pub duration_secs: f64,
    pub sample_rate: Option<u32>,
    pub bitrate_kbps: Option<u32>,
    pub format: String,
    pub file_size: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct LibraryFolder {
    pub id: i64,
    pub path: String,
    pub added_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ArtistSummary {
    pub name: String,
    pub track_count: usize,
    pub album_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct AlbumSummary {
    pub name: String,
    pub artist: String,
    pub year: Option<u32>,
    pub track_count: usize,
    pub folder_path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GenreSummary {
    pub name: String,
    pub track_count: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LibraryFilter {
    pub artist: Option<String>,
    pub album: Option<String>,
    pub genre: Option<String>,
    pub search: Option<String>,
    pub sort_by: Option<String>,
    pub sort_direction: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LibraryScanProgress {
    pub total: usize,
    pub completed: usize,
    pub current_file: String,
}

// ── Database state ──────────────────────────────────────────────

pub struct LibraryDb {
    pub conn: std::sync::Arc<std::sync::Mutex<Connection>>,
}

impl LibraryDb {
    pub fn new(conn: Connection) -> Self {
        Self {
            conn: std::sync::Arc::new(std::sync::Mutex::new(conn)),
        }
    }

    pub fn conn_arc(&self) -> std::sync::Arc<std::sync::Mutex<Connection>> {
        self.conn.clone()
    }
}

// ── Database init ───────────────────────────────────────────────

pub fn init_db(db_path: &Path) -> Result<Connection, String> {
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create db dir: {}", e))?;
    }

    let conn =
        Connection::open(db_path).map_err(|e| format!("Failed to open library db: {}", e))?;

    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .map_err(|e| format!("Failed to set pragmas: {}", e))?;

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
            year INTEGER,
            genre TEXT,
            duration_secs REAL NOT NULL DEFAULT 0,
            sample_rate INTEGER,
            bitrate_kbps INTEGER,
            format TEXT NOT NULL DEFAULT '',
            file_size INTEGER NOT NULL DEFAULT 0,
            modified_at INTEGER NOT NULL DEFAULT 0,
            scanned_at INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS library_folders (
            id INTEGER PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            added_at INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_tracks_album_artist ON tracks(album_artist COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_tracks_genre ON tracks(genre COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_tracks_folder ON tracks(folder_path);",
    )
    .map_err(|e| format!("Failed to create tables: {}", e))?;

    Ok(conn)
}

// ── Folder management ───────────────────────────────────────────

pub fn add_folder(conn: &Connection, path: &str) -> Result<(), String> {
    let now = now_epoch();
    conn.execute(
        "INSERT OR IGNORE INTO library_folders (path, added_at) VALUES (?1, ?2)",
        params![path, now],
    )
    .map_err(|e| format!("Failed to add folder: {}", e))?;
    Ok(())
}

pub fn remove_folder(conn: &Connection, path: &str) -> Result<(), String> {
    // Remove all tracks whose file_path starts with this folder
    conn.execute(
        "DELETE FROM tracks WHERE file_path LIKE ?1",
        params![format!("{}%", path)],
    )
    .map_err(|e| format!("Failed to remove tracks: {}", e))?;

    conn.execute("DELETE FROM library_folders WHERE path = ?1", params![path])
        .map_err(|e| format!("Failed to remove folder: {}", e))?;

    Ok(())
}

pub fn get_folders(conn: &Connection) -> Result<Vec<LibraryFolder>, String> {
    let mut stmt = conn
        .prepare("SELECT id, path, added_at FROM library_folders ORDER BY added_at")
        .map_err(|e| format!("Query failed: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(LibraryFolder {
                id: row.get(0)?,
                path: row.get(1)?,
                added_at: row.get(2)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row read failed: {}", e))
}

// ── Scanning ────────────────────────────────────────────────────

pub fn scan_folder(
    conn: &Connection,
    folder_path: &str,
    app: &AppHandle,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<usize, String> {
    let root = Path::new(folder_path);
    if !root.exists() {
        return Err(format!("Path does not exist: {}", folder_path));
    }

    let mut audio_files = Vec::new();
    collect_audio_files(root, &mut audio_files);

    let total = audio_files.len();
    let now = now_epoch();
    let mut scanned = 0;

    for (i, file_path) in audio_files.iter().enumerate() {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err("Cancelled".to_string());
        }

        let file_name = file_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let _ = app.emit(
            "library-scan-progress",
            LibraryScanProgress {
                total,
                completed: i,
                current_file: file_name,
            },
        );

        // Check if file needs re-scan based on mtime
        let file_path_str = file_path.to_string_lossy().to_string();
        let mtime = fs::metadata(file_path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let existing_mtime: Option<i64> = conn
            .query_row(
                "SELECT modified_at FROM tracks WHERE file_path = ?1",
                params![file_path_str],
                |row| row.get(0),
            )
            .ok();

        if existing_mtime == Some(mtime) {
            // File hasn't changed, skip
            scanned += 1;
            continue;
        }

        if let Some(track_data) = read_track_for_library(file_path) {
            upsert_track(conn, &track_data, mtime, now)?;
        }

        scanned += 1;
    }

    // Remove tracks that no longer exist on disk for this folder
    let mut stmt = conn
        .prepare("SELECT file_path FROM tracks WHERE file_path LIKE ?1")
        .map_err(|e| format!("Query failed: {}", e))?;

    let db_paths: Vec<String> = stmt
        .query_map(params![format!("{}%", folder_path)], |row| row.get(0))
        .map_err(|e| format!("Query failed: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    for db_path in &db_paths {
        if !Path::new(db_path).exists() {
            conn.execute("DELETE FROM tracks WHERE file_path = ?1", params![db_path])
                .ok();
        }
    }

    Ok(scanned)
}

struct TrackData {
    file_path: String,
    file_name: String,
    folder_path: String,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    album_artist: Option<String>,
    sort_artist: Option<String>,
    sort_album_artist: Option<String>,
    track_number: Option<u32>,
    track_total: Option<u32>,
    disc_number: Option<u32>,
    year: Option<u32>,
    genre: Option<String>,
    duration_secs: f64,
    sample_rate: Option<u32>,
    bitrate_kbps: Option<u32>,
    format: String,
    file_size: u64,
}

fn read_track_for_library(path: &Path) -> Option<TrackData> {
    let file_path = path.to_string_lossy().to_string();
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let folder_path = path
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let format = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_uppercase())
        .unwrap_or_default();
    let file_size = fs::metadata(path).map(|m| m.len()).unwrap_or(0);

    let probe = Probe::open(path).ok()?;
    let tagged = probe.read().ok()?;

    let props = tagged.properties();
    let duration_secs = props.duration().as_secs_f64();
    let sample_rate = props.sample_rate();
    let bitrate_kbps = props.audio_bitrate();

    let tag = tagged.primary_tag().or_else(|| tagged.first_tag());

    let (
        title,
        artist,
        album,
        album_artist,
        sort_artist,
        sort_album_artist,
        track_number,
        track_total,
        disc_number,
        year,
        genre,
    ) = if let Some(tag) = tag {
        (
            tag.title().map(|s| s.to_string()),
            tag.artist().map(|s| s.to_string()),
            tag.album().map(|s| s.to_string()),
            tag.get_string(&ItemKey::AlbumArtist).map(|s| s.to_string()),
            tag.get_string(&ItemKey::TrackArtistSortOrder)
                .map(|s| s.to_string()),
            tag.get_string(&ItemKey::AlbumArtistSortOrder)
                .map(|s| s.to_string()),
            tag.track(),
            tag.track_total(),
            tag.disk(),
            tag.year(),
            tag.genre().map(|s| s.to_string()),
        )
    } else {
        (
            None, None, None, None, None, None, None, None, None, None, None,
        )
    };

    Some(TrackData {
        file_path,
        file_name,
        folder_path,
        title,
        artist,
        album,
        album_artist,
        sort_artist,
        sort_album_artist,
        track_number,
        track_total,
        disc_number,
        year,
        genre,
        duration_secs,
        sample_rate,
        bitrate_kbps,
        format,
        file_size,
    })
}

fn upsert_track(conn: &Connection, t: &TrackData, mtime: i64, now: i64) -> Result<(), String> {
    conn.execute(
        "INSERT INTO tracks (
            file_path, file_name, folder_path, title, artist, album, album_artist,
            sort_artist, sort_album_artist, track_number, track_total, disc_number,
            year, genre, duration_secs, sample_rate, bitrate_kbps, format,
            file_size, modified_at, scanned_at, created_at
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14,
            ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22
        )
        ON CONFLICT(file_path) DO UPDATE SET
            file_name=excluded.file_name, folder_path=excluded.folder_path,
            title=excluded.title, artist=excluded.artist, album=excluded.album,
            album_artist=excluded.album_artist, sort_artist=excluded.sort_artist,
            sort_album_artist=excluded.sort_album_artist, track_number=excluded.track_number,
            track_total=excluded.track_total, disc_number=excluded.disc_number,
            year=excluded.year, genre=excluded.genre, duration_secs=excluded.duration_secs,
            sample_rate=excluded.sample_rate, bitrate_kbps=excluded.bitrate_kbps,
            format=excluded.format, file_size=excluded.file_size,
            modified_at=excluded.modified_at, scanned_at=excluded.scanned_at",
        params![
            t.file_path,
            t.file_name,
            t.folder_path,
            t.title,
            t.artist,
            t.album,
            t.album_artist,
            t.sort_artist,
            t.sort_album_artist,
            t.track_number,
            t.track_total,
            t.disc_number,
            t.year,
            t.genre,
            t.duration_secs,
            t.sample_rate,
            t.bitrate_kbps,
            t.format,
            t.file_size as i64,
            mtime,
            now,
            now,
        ],
    )
    .map_err(|e| format!("Failed to upsert track: {}", e))?;

    Ok(())
}

// ── Queries ─────────────────────────────────────────────────────

pub fn get_tracks(conn: &Connection, filter: &LibraryFilter) -> Result<Vec<LibraryTrack>, String> {
    let mut conditions = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref artist) = filter.artist {
        conditions.push("(artist = ? OR album_artist = ?)");
        param_values.push(Box::new(artist.clone()));
        param_values.push(Box::new(artist.clone()));
    }
    if let Some(ref album) = filter.album {
        conditions.push("album = ?");
        param_values.push(Box::new(album.clone()));
    }
    if let Some(ref genre) = filter.genre {
        conditions.push("genre = ?");
        param_values.push(Box::new(genre.clone()));
    }
    if let Some(ref search) = filter.search {
        if !search.is_empty() {
            conditions.push(
                "(title LIKE ? OR artist LIKE ? OR album LIKE ? OR album_artist LIKE ? OR genre LIKE ?)",
            );
            let like = format!("%{}%", search);
            for _ in 0..5 {
                param_values.push(Box::new(like.clone()));
            }
        }
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let sort_col = match filter.sort_by.as_deref() {
        Some("title") => "COALESCE(title, file_name)",
        Some("artist") => "COALESCE(sort_artist, artist, '')",
        Some("album") => "COALESCE(album, '')",
        Some("track_number") => "COALESCE(disc_number, 0), COALESCE(track_number, 0)",
        Some("year") => "COALESCE(year, 0)",
        Some("duration") => "duration_secs",
        Some("bitrate") => "COALESCE(bitrate_kbps, 0)",
        Some("genre") => "COALESCE(genre, '')",
        _ => "COALESCE(sort_artist, artist, ''), COALESCE(album, ''), COALESCE(disc_number, 0), COALESCE(track_number, 0)",
    };

    let direction = match filter.sort_direction.as_deref() {
        Some("desc") => "DESC",
        _ => "ASC",
    };

    let sql = format!(
        "SELECT id, file_path, file_name, folder_path, title, artist, album, album_artist,
                sort_artist, sort_album_artist, track_number, track_total, disc_number,
                year, genre, duration_secs, sample_rate, bitrate_kbps, format, file_size
         FROM tracks {} ORDER BY {} {}",
        where_clause, sort_col, direction
    );

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Query failed: {}", e))?;

    let params_refs: Vec<&dyn rusqlite::types::ToSql> =
        param_values.iter().map(|p| p.as_ref()).collect();

    let rows = stmt
        .query_map(params_refs.as_slice(), |row| {
            Ok(LibraryTrack {
                id: row.get(0)?,
                file_path: row.get(1)?,
                file_name: row.get(2)?,
                folder_path: row.get(3)?,
                title: row.get(4)?,
                artist: row.get(5)?,
                album: row.get(6)?,
                album_artist: row.get(7)?,
                sort_artist: row.get(8)?,
                sort_album_artist: row.get(9)?,
                track_number: row.get(10)?,
                track_total: row.get(11)?,
                disc_number: row.get(12)?,
                year: row.get(13)?,
                genre: row.get(14)?,
                duration_secs: row.get(15)?,
                sample_rate: row.get(16)?,
                bitrate_kbps: row.get(17)?,
                format: row.get(18)?,
                file_size: row.get::<_, i64>(19).map(|v| v as u64)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row read failed: {}", e))
}

pub fn get_artists(conn: &Connection) -> Result<Vec<ArtistSummary>, String> {
    let sql = "SELECT
            COALESCE(album_artist, artist) as display_artist,
            COUNT(*) as track_count,
            COUNT(DISTINCT album) as album_count
        FROM tracks
        WHERE COALESCE(album_artist, artist) IS NOT NULL
            AND COALESCE(album_artist, artist) != ''
        GROUP BY display_artist
        ORDER BY display_artist COLLATE NOCASE ASC";

    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("Query failed: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ArtistSummary {
                name: row.get(0)?,
                track_count: row.get::<_, i64>(1).map(|v| v as usize)?,
                album_count: row.get::<_, i64>(2).map(|v| v as usize)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row read failed: {}", e))
}

pub fn get_albums(conn: &Connection, artist: Option<&str>) -> Result<Vec<AlbumSummary>, String> {
    let (sql, param_values): (String, Vec<Box<dyn rusqlite::types::ToSql>>) =
        if let Some(artist) = artist {
            (
                "SELECT album, COALESCE(album_artist, artist) as display_artist,
                    MIN(year) as year, COUNT(*) as track_count,
                    MIN(folder_path) as folder_path
             FROM tracks
             WHERE album IS NOT NULL AND album != ''
                AND (album_artist = ?1 OR artist = ?1)
             GROUP BY album, display_artist
             ORDER BY COALESCE(MIN(year), 0) ASC, album COLLATE NOCASE ASC"
                    .to_string(),
                vec![Box::new(artist.to_string())],
            )
        } else {
            (
                "SELECT album, COALESCE(album_artist, artist) as display_artist,
                    MIN(year) as year, COUNT(*) as track_count,
                    MIN(folder_path) as folder_path
             FROM tracks
             WHERE album IS NOT NULL AND album != ''
             GROUP BY album, display_artist
             ORDER BY display_artist COLLATE NOCASE ASC, COALESCE(MIN(year), 0) ASC"
                    .to_string(),
                vec![],
            )
        };

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Query failed: {}", e))?;
    let params_refs: Vec<&dyn rusqlite::types::ToSql> =
        param_values.iter().map(|p| p.as_ref()).collect();

    let rows = stmt
        .query_map(params_refs.as_slice(), |row| {
            Ok(AlbumSummary {
                name: row.get(0)?,
                artist: row.get(1)?,
                year: row.get(2)?,
                track_count: row.get::<_, i64>(3).map(|v| v as usize)?,
                folder_path: row.get(4)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row read failed: {}", e))
}

pub fn get_genres(conn: &Connection) -> Result<Vec<GenreSummary>, String> {
    let sql = "SELECT genre, COUNT(*) as track_count
        FROM tracks
        WHERE genre IS NOT NULL AND genre != ''
        GROUP BY genre
        ORDER BY genre COLLATE NOCASE ASC";

    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("Query failed: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(GenreSummary {
                name: row.get(0)?,
                track_count: row.get::<_, i64>(1).map(|v| v as usize)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row read failed: {}", e))
}

pub fn search_tracks(conn: &Connection, query: &str) -> Result<Vec<LibraryTrack>, String> {
    let filter = LibraryFilter {
        artist: None,
        album: None,
        genre: None,
        search: Some(query.to_string()),
        sort_by: None,
        sort_direction: None,
    };
    get_tracks(conn, &filter)
}

// ── Helpers ─────────────────────────────────────────────────────

fn now_epoch() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

#[cfg(test)]
mod tests {
    use super::*;

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
                year INTEGER,
                genre TEXT,
                duration_secs REAL NOT NULL DEFAULT 0,
                sample_rate INTEGER,
                bitrate_kbps INTEGER,
                format TEXT NOT NULL DEFAULT '',
                file_size INTEGER NOT NULL DEFAULT 0,
                modified_at INTEGER NOT NULL DEFAULT 0,
                scanned_at INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL DEFAULT 0
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
        let folders = get_folders(&conn).unwrap();
        assert_eq!(folders.len(), 1);
        assert_eq!(folders[0].path, "/music");

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
}
