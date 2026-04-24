mod folders;
mod import;
mod queries;
mod reorganize;
mod scan;
mod settings;
#[cfg(test)]
#[path = "tests.rs"]
mod tests;
pub mod types;

use rusqlite::Connection;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

// ── Re-exports (preserve public API) ───────────────────────────

pub use folders::{add_folder, get_folders, remove_folder};
pub use import::import_to_library;
pub use queries::{
    get_albums, get_artists, get_browser_data, get_genres, get_tracks, search_tracks,
};
pub use reorganize::reorganize_library_file;
pub use scan::{rescan_all_folders, scan_folder};
pub use settings::{get_library_location, set_library_location};
pub use types::*;

// ── Database state ─────────────────────────────────────────────

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

// ── Database init ──────────────────────────────────────────────

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

    // Migrations for existing databases
    let _ = conn.execute_batch("ALTER TABLE tracks ADD COLUMN disc_total INTEGER");
    let _ =
        conn.execute_batch("ALTER TABLE tracks ADD COLUMN play_count INTEGER NOT NULL DEFAULT 0");

    Ok(conn)
}

// ── Helpers ────────────────────────────────────────────────────

fn now_epoch() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
