use crate::audio_utils::collect_audio_files;
use lofty::prelude::{Accessor, AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::ItemKey;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
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
pub struct BrowserData {
    pub tracks: Vec<LibraryTrack>,
    pub genres: Vec<GenreSummary>,
    pub artists: Vec<ArtistSummary>,
    pub albums: Vec<AlbumSummary>,
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

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
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

// ── Settings ───────────────────────────────────────────────────

fn get_setting(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .ok()
}

fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| format!("Failed to save setting: {}", e))?;
    Ok(())
}

pub fn get_library_location(conn: &Connection) -> Option<String> {
    get_setting(conn, "library_location")
}

pub fn set_library_location(conn: &Connection, path: &str) -> Result<(), String> {
    set_setting(conn, "library_location", path)?;

    // The library location is the single source of truth — sync library_folders
    conn.execute("DELETE FROM tracks", [])
        .map_err(|e| format!("Failed to clear tracks: {}", e))?;
    conn.execute("DELETE FROM library_folders", [])
        .map_err(|e| format!("Failed to clear folders: {}", e))?;
    add_folder(conn, path)?;

    Ok(())
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

pub fn rescan_all_folders(
    conn: &Connection,
    app: &AppHandle,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<(), String> {
    let folders = get_folders(conn)?;

    // Collect all audio files across all folders upfront for unified progress
    let mut all_files: Vec<(PathBuf, String)> = Vec::new();
    for folder in &folders {
        let root = Path::new(&folder.path);
        if !root.exists() {
            continue;
        }
        let mut folder_files = Vec::new();
        collect_audio_files(root, &mut folder_files);
        for f in folder_files {
            all_files.push((f, folder.path.clone()));
        }
    }

    let total = all_files.len();
    let now = now_epoch();

    for (i, (file_path, _folder_path)) in all_files.iter().enumerate() {
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
            continue;
        }

        if let Some(track_data) = read_track_for_library(file_path) {
            upsert_track(conn, &track_data, mtime, now)?;
        }
    }

    // Remove orphaned tracks for each folder
    for folder in &folders {
        let mut stmt = conn
            .prepare("SELECT file_path FROM tracks WHERE file_path LIKE ?1")
            .map_err(|e| format!("Query failed: {}", e))?;

        let db_paths: Vec<String> = stmt
            .query_map(params![format!("{}%", folder.path)], |row| row.get(0))
            .map_err(|e| format!("Query failed: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        for db_path in &db_paths {
            if !Path::new(db_path).exists() {
                conn.execute("DELETE FROM tracks WHERE file_path = ?1", params![db_path])
                    .ok();
            }
        }
    }

    // Emit final progress
    let _ = app.emit(
        "library-scan-progress",
        LibraryScanProgress {
            total,
            completed: total,
            current_file: String::new(),
        },
    );

    Ok(())
}

// ── Import to library ──────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct ImportResult {
    pub total_files: usize,
    pub copied: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportProgress {
    pub total: usize,
    pub completed: usize,
    pub current_file: String,
}

pub fn sanitize_path_component(name: &str) -> String {
    let sanitized: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect();
    let trimmed = sanitized.trim().trim_end_matches('.').trim().to_string();
    if trimmed.is_empty() {
        return "Unknown".to_string();
    }
    if trimmed.len() > 255 {
        trimmed[..255].to_string()
    } else {
        trimmed
    }
}

fn compute_library_dest(library_root: &Path, track: &TrackData) -> PathBuf {
    let artist_name = track
        .album_artist
        .as_deref()
        .or(track.artist.as_deref())
        .unwrap_or("Unknown Artist");
    let album_name = track.album.as_deref().unwrap_or("Unknown Album");

    library_root
        .join(sanitize_path_component(artist_name))
        .join(sanitize_path_component(album_name))
        .join(&track.file_name)
}

pub fn import_to_library(
    library_root: &str,
    source_paths: &[String],
    conn: &Connection,
    app: &AppHandle,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<ImportResult, String> {
    let root = Path::new(library_root);

    // Collect all audio files from the source paths
    let mut audio_files: Vec<PathBuf> = Vec::new();
    for path_str in source_paths {
        let path = Path::new(path_str);
        if path.is_dir() {
            collect_audio_files(path, &mut audio_files);
        } else if path.is_file() && crate::audio_utils::is_audio(path) {
            audio_files.push(path.to_path_buf());
        }
    }

    let total = audio_files.len();
    let mut copied = 0;
    let mut skipped = 0;
    let mut errors = Vec::new();

    for (i, src_path) in audio_files.iter().enumerate() {
        if cancel_flag.load(Ordering::SeqCst) {
            return Ok(ImportResult {
                total_files: total,
                copied,
                skipped,
                errors,
            });
        }

        let file_name = src_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let _ = app.emit(
            "import-progress",
            ImportProgress {
                total,
                completed: i,
                current_file: file_name.clone(),
            },
        );

        // Read metadata to determine destination
        let track_data = match read_track_for_library(src_path) {
            Some(td) => td,
            None => {
                errors.push(format!("{}: Failed to read metadata", file_name));
                continue;
            }
        };

        let dest_path = compute_library_dest(root, &track_data);

        // Skip if destination already exists
        if dest_path.exists() {
            skipped += 1;
            continue;
        }

        // Create parent directories
        if let Some(parent) = dest_path.parent() {
            if let Err(e) = fs::create_dir_all(parent) {
                errors.push(format!("{}: Failed to create directory: {}", file_name, e));
                continue;
            }
        }

        // Copy the file
        match fs::copy(src_path, &dest_path) {
            Ok(_) => copied += 1,
            Err(e) => {
                errors.push(format!("{}: Copy failed: {}", file_name, e));
            }
        }
    }

    // Emit final progress
    let _ = app.emit(
        "import-progress",
        ImportProgress {
            total,
            completed: total,
            current_file: String::new(),
        },
    );

    // Ensure library root is registered as a library folder and scan it
    add_folder(conn, library_root)?;
    scan_folder(conn, library_root, app, cancel_flag)?;

    Ok(ImportResult {
        total_files: total,
        copied,
        skipped,
        errors,
    })
}

// ── Reorganization on metadata change ──────────────────────────

pub fn update_track_path(conn: &Connection, old_path: &str, new_path: &str) -> Result<(), String> {
    let new_pb = Path::new(new_path);
    let file_name = new_pb
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let folder_path = new_pb
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    conn.execute(
        "UPDATE tracks SET file_path = ?1, file_name = ?2, folder_path = ?3 WHERE file_path = ?4",
        params![new_path, file_name, folder_path, old_path],
    )
    .map_err(|e| format!("Failed to update track path: {}", e))?;
    Ok(())
}

pub fn cleanup_empty_dirs(start: &Path, stop_at: &Path) {
    let mut current = start.to_path_buf();
    while current.starts_with(stop_at) && current != stop_at {
        let is_empty = fs::read_dir(&current)
            .map(|mut d| d.next().is_none())
            .unwrap_or(false);
        if !is_empty {
            break;
        }
        let _ = fs::remove_dir(&current);
        match current.parent() {
            Some(parent) => current = parent.to_path_buf(),
            None => break,
        }
    }
}

pub fn reorganize_library_file(
    conn: &Connection,
    library_root: &str,
    file_path: &str,
) -> Result<Option<String>, String> {
    let src = Path::new(file_path);
    if !src.exists() {
        return Ok(None);
    }

    let track_data = match read_track_for_library(src) {
        Some(td) => td,
        None => return Ok(None),
    };

    let root = Path::new(library_root);
    let dest = compute_library_dest(root, &track_data);

    // No move needed if already in the right place
    if dest == src {
        return Ok(None);
    }

    // Create destination directory
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    // Move the file (same volume = instant rename)
    fs::rename(src, &dest).map_err(|e| format!("Failed to move file: {}", e))?;

    let new_path = dest.to_string_lossy().to_string();
    update_track_path(conn, file_path, &new_path)?;

    // Clean up empty directories
    if let Some(old_parent) = src.parent() {
        cleanup_empty_dirs(old_parent, root);
    }

    Ok(Some(new_path))
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

    let trim_tag = |s: &str| {
        let trimmed = s.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    };

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
            tag.title().and_then(|s| trim_tag(&s)),
            tag.artist().and_then(|s| trim_tag(&s)),
            tag.album().and_then(|s| trim_tag(&s)),
            tag.get_string(&ItemKey::AlbumArtist).and_then(trim_tag),
            tag.get_string(&ItemKey::TrackArtistSortOrder)
                .and_then(trim_tag),
            tag.get_string(&ItemKey::AlbumArtistSortOrder)
                .and_then(trim_tag),
            tag.track(),
            tag.track_total(),
            tag.disk(),
            tag.year(),
            tag.genre().and_then(|s| trim_tag(&s)),
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
        conditions.push("COALESCE(album_artist, artist) = ?");
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

    let dir = match filter.sort_direction.as_deref() {
        Some("desc") => "DESC",
        _ => "ASC",
    };

    // Primary sort gets the user's direction; secondary tiebreakers are always ASC
    let order_by = match filter.sort_by.as_deref() {
        Some("title") => format!(
            "COALESCE(title, file_name) {dir}, COALESCE(sort_artist, artist, ''), COALESCE(album, ''), COALESCE(disc_number, 0), COALESCE(track_number, 0)"
        ),
        Some("artist") => format!(
            "COALESCE(sort_artist, artist, '') {dir}, COALESCE(album, ''), COALESCE(disc_number, 0), COALESCE(track_number, 0)"
        ),
        Some("album") => format!(
            "COALESCE(album, '') {dir}, COALESCE(disc_number, 0), COALESCE(track_number, 0)"
        ),
        Some("track_number") => format!(
            "COALESCE(disc_number, 0) {dir}, COALESCE(track_number, 0) {dir}"
        ),
        Some("year") => format!(
            "COALESCE(year, 0) {dir}, COALESCE(sort_artist, artist, ''), COALESCE(album, ''), COALESCE(disc_number, 0), COALESCE(track_number, 0)"
        ),
        Some("duration") => format!("duration_secs {dir}"),
        Some("bitrate") => format!("COALESCE(bitrate_kbps, 0) {dir}"),
        Some("genre") => format!(
            "COALESCE(genre, '') {dir}, COALESCE(sort_artist, artist, ''), COALESCE(album, ''), COALESCE(disc_number, 0), COALESCE(track_number, 0)"
        ),
        _ => format!(
            "COALESCE(sort_artist, artist, '') {dir}, COALESCE(album, ''), COALESCE(disc_number, 0), COALESCE(track_number, 0)"
        ),
    };

    let sql = format!(
        "SELECT id, file_path, file_name, folder_path, title, artist, album, album_artist,
                sort_artist, sort_album_artist, track_number, track_total, disc_number,
                year, genre, duration_secs, sample_rate, bitrate_kbps, format, file_size
         FROM tracks {} ORDER BY {}",
        where_clause, order_by
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

// ── Browser data (combined endpoint for column browser) ────────

fn build_filter_conditions(
    genre: Option<&str>,
    artist: Option<&str>,
    album: Option<&str>,
    search: Option<&str>,
) -> (Vec<String>, Vec<Box<dyn rusqlite::types::ToSql>>) {
    let mut conditions = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(genre) = genre {
        conditions.push("genre = ?".to_string());
        params.push(Box::new(genre.to_string()));
    }
    if let Some(artist) = artist {
        conditions.push("COALESCE(album_artist, artist) = ?".to_string());
        params.push(Box::new(artist.to_string()));
    }
    if let Some(album) = album {
        conditions.push("album = ?".to_string());
        params.push(Box::new(album.to_string()));
    }
    if let Some(search) = search {
        if !search.is_empty() {
            conditions.push(
                "(title LIKE ? OR artist LIKE ? OR album LIKE ? OR album_artist LIKE ? OR genre LIKE ?)".to_string(),
            );
            let like = format!("%{}%", search);
            for _ in 0..5 {
                params.push(Box::new(like.clone()));
            }
        }
    }

    (conditions, params)
}

fn where_clause(conditions: &[String]) -> String {
    if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    }
}

pub fn get_browser_data(conn: &Connection, filter: &LibraryFilter) -> Result<BrowserData, String> {
    let genre = filter.genre.as_deref();
    let artist = filter.artist.as_deref();
    let album = filter.album.as_deref();
    let search = filter.search.as_deref();

    // Tracks: filtered by all 3 columns + search
    let tracks = get_tracks(conn, filter)?;

    // Genres: filtered by artist + album (NOT genre) + search
    let genres = {
        let (mut conds, params) = build_filter_conditions(None, artist, album, search);
        conds.insert(0, "genre IS NOT NULL AND genre != ''".to_string());
        let wc = where_clause(&conds);
        let sql = format!(
            "SELECT genre, COUNT(*) as track_count FROM tracks {} GROUP BY genre ORDER BY genre COLLATE NOCASE ASC",
            wc
        );
        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| format!("Query failed: {}", e))?;
        let refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let rows = stmt
            .query_map(refs.as_slice(), |row| {
                Ok(GenreSummary {
                    name: row.get(0)?,
                    track_count: row.get::<_, i64>(1).map(|v| v as usize)?,
                })
            })
            .map_err(|e| format!("Query failed: {}", e))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Row read failed: {}", e))?
    };

    // Artists: filtered by genre + album (NOT artist) + search
    let artists = {
        let (mut conds, params) = build_filter_conditions(genre, None, album, search);
        conds.insert(
            0,
            "COALESCE(album_artist, artist) IS NOT NULL AND COALESCE(album_artist, artist) != ''"
                .to_string(),
        );
        let wc = where_clause(&conds);
        let sql = format!(
            "SELECT COALESCE(album_artist, artist) as display_artist, COUNT(*) as track_count, COUNT(DISTINCT album) as album_count FROM tracks {} GROUP BY display_artist ORDER BY display_artist COLLATE NOCASE ASC",
            wc
        );
        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| format!("Query failed: {}", e))?;
        let refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let rows = stmt
            .query_map(refs.as_slice(), |row| {
                Ok(ArtistSummary {
                    name: row.get(0)?,
                    track_count: row.get::<_, i64>(1).map(|v| v as usize)?,
                    album_count: row.get::<_, i64>(2).map(|v| v as usize)?,
                })
            })
            .map_err(|e| format!("Query failed: {}", e))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Row read failed: {}", e))?
    };

    // Albums: filtered by genre + artist (NOT album) + search
    let albums = {
        let (mut conds, params) = build_filter_conditions(genre, artist, None, search);
        conds.insert(0, "album IS NOT NULL AND album != ''".to_string());
        let wc = where_clause(&conds);
        let sql = format!(
            "SELECT album, COALESCE(album_artist, artist) as display_artist, MIN(year) as year, COUNT(*) as track_count, MIN(folder_path) as folder_path FROM tracks {} GROUP BY album, display_artist ORDER BY album COLLATE NOCASE ASC",
            wc
        );
        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| format!("Query failed: {}", e))?;
        let refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let rows = stmt
            .query_map(refs.as_slice(), |row| {
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
            .map_err(|e| format!("Row read failed: {}", e))?
    };

    Ok(BrowserData {
        tracks,
        genres,
        artists,
        albums,
    })
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
    fn browser_data_filters_albums_by_artist() {
        let conn = test_db();
        // Beatles: 2 albums
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
        // Pink Floyd: 2 albums
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
        // Jazz artist
        insert_test_track(
            &conn,
            "/m/c1.mp3",
            "So What",
            "Miles Davis",
            "Kind of Blue",
            "Jazz",
            1959,
        );

        // Filter by Beatles
        let filter = LibraryFilter {
            artist: Some("Beatles".to_string()),
            genre: None,
            album: None,
            search: None,
            sort_by: None,
            sort_direction: None,
        };
        let data = get_browser_data(&conn, &filter).unwrap();

        // Tracks: only Beatles tracks
        assert_eq!(data.tracks.len(), 2);

        // Albums: only Beatles albums
        assert_eq!(data.albums.len(), 2);
        let album_names: Vec<&str> = data.albums.iter().map(|a| a.name.as_str()).collect();
        assert!(album_names.contains(&"Abbey Road"));
        assert!(album_names.contains(&"Let It Be"));
        assert!(!album_names.contains(&"Dark Side"));
        assert!(!album_names.contains(&"The Wall"));
        assert!(!album_names.contains(&"Kind of Blue"));

        // Genres: only genres Beatles tracks have (Rock)
        assert_eq!(data.genres.len(), 1);
        assert_eq!(data.genres[0].name, "Rock");

        // Artists: should show ALL artists (not filtered by artist)
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
}
