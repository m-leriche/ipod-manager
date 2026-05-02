mod delete;
pub mod duplicates;
mod folders;
mod import;
pub mod playlists;
mod queries;
mod reorganize;
mod scan;
mod settings;
pub mod smart_playlists;
#[cfg(test)]
#[path = "tests.rs"]
mod tests;
pub mod types;

use rusqlite::Connection;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

// ── Re-exports (preserve public API) ───────────────────────────

pub use delete::delete_tracks;
pub use folders::{add_folder, get_folders, remove_folder};
pub use import::import_to_library;
pub use queries::{
    get_albums, get_artists, get_browser_data, get_genres, get_tracks, search_tracks,
};
pub use reorganize::reorganize_library_file;
pub(crate) use scan::{read_track_for_library, upsert_track};
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
        CREATE INDEX IF NOT EXISTS idx_tracks_folder ON tracks(folder_path);

        CREATE TABLE IF NOT EXISTS playlists (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            created_at INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS playlist_tracks (
            id INTEGER PRIMARY KEY,
            playlist_id INTEGER NOT NULL,
            track_id INTEGER NOT NULL,
            position INTEGER NOT NULL,
            FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
            FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE,
            UNIQUE(playlist_id, track_id)
        );

        CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist ON playlist_tracks(playlist_id, position);",
    )
    .map_err(|e| format!("Failed to create tables: {}", e))?;

    // Migrations for existing databases
    let _ = conn.execute_batch("ALTER TABLE tracks ADD COLUMN disc_total INTEGER");
    let _ =
        conn.execute_batch("ALTER TABLE tracks ADD COLUMN play_count INTEGER NOT NULL DEFAULT 0");
    let _ = conn.execute_batch("ALTER TABLE tracks ADD COLUMN flagged INTEGER NOT NULL DEFAULT 0");
    let _ = conn.execute_batch("ALTER TABLE tracks ADD COLUMN rating INTEGER NOT NULL DEFAULT 0");
    let _ = conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_tracks_rating ON tracks(rating)");

    // Smart playlists table
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS smart_playlists (
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
    .map_err(|e| format!("Failed to create smart_playlists table: {}", e))?;

    // Seed built-in smart playlists
    let now = now_epoch();
    let seed_sql = "INSERT OR IGNORE INTO smart_playlists (name, icon, rules_json, sort_by, sort_direction, track_limit, is_builtin, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8)";
    let _ = conn.execute(
        seed_sql,
        rusqlite::params![
            "Recently Added",
            "clock",
            r#"{"match":"all","rules":[{"field":"created_at","operator":"in_last_days","value":"30"}]}"#,
            "created_at",
            "desc",
            100_i64,
            now,
            now
        ],
    );
    let _ = conn.execute(
        seed_sql,
        rusqlite::params![
            "Most Played",
            "fire",
            r#"{"match":"all","rules":[{"field":"play_count","operator":"greater_than","value":"0"}]}"#,
            "play_count",
            "desc",
            100_i64,
            now,
            now
        ],
    );
    let _ = conn.execute(
        seed_sql,
        rusqlite::params![
            "Unplayed",
            "circle",
            r#"{"match":"all","rules":[{"field":"play_count","operator":"equals","value":"0"}]}"#,
            None::<&str>,
            None::<&str>,
            None::<i64>,
            now,
            now
        ],
    );

    Ok(conn)
}

// ── Helpers ────────────────────────────────────────────────────

fn now_epoch() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
