pub mod backup;
mod delete;
pub mod duplicates;
pub mod export;
mod folders;
pub mod health;
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
mod track_io;
pub mod types;

use rusqlite::Connection;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

// ── Re-exports (preserve public API) ───────────────────────────

pub use delete::delete_tracks;
pub use folders::{add_folder, get_folders, remove_folder};
pub use import::import_to_library;
pub(crate) use queries::register_sort_key;
pub use queries::{
    get_albums, get_albums_sorted, get_artists, get_browser_data, get_browser_data_paginated,
    get_genres, get_track_by_id, get_tracks, get_tracks_paginated, search_albums, search_artists,
    search_tracks,
};
pub(crate) use queries::{row_to_track, SELECT_COLUMNS};
pub use reorganize::reorganize_library_file;
pub use scan::{background_rescan_all_folders, rescan_all_folders, scan_folder};
pub use settings::{
    delete_setting, get_library_location, get_setting, set_library_location, set_setting,
};
pub(crate) use track_io::{read_track_for_library, upsert_track};
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

    /// Lock the database synchronously. Use for lightweight operations
    /// that don't need `spawn_blocking`.
    pub fn lock_conn(
        &self,
    ) -> Result<std::sync::MutexGuard<'_, Connection>, crate::error::AppError> {
        self.conn
            .lock()
            .map_err(|e| crate::error::AppError::Generic(format!("DB lock failed: {}", e)))
    }

    /// Run a blocking closure with the database connection locked.
    /// Wraps `spawn_blocking` + mutex lock + error conversion.
    pub async fn with_db<F, T, E>(&self, f: F) -> Result<T, crate::error::AppError>
    where
        F: FnOnce(&Connection) -> Result<T, E> + Send + 'static,
        T: Send + 'static,
        E: Into<crate::error::AppError> + Send + 'static,
    {
        let conn_arc = self.conn_arc();
        tauri::async_runtime::spawn_blocking(move || {
            let conn = conn_arc
                .lock()
                .map_err(|e| crate::error::AppError::Generic(format!("DB lock failed: {}", e)))?;
            f(&conn).map_err(Into::into)
        })
        .await
        .map_err(|e| crate::error::AppError::Generic(format!("Task failed: {}", e)))?
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

    // Register sort_key() as a SQL scalar so ORDER BY can normalise strings
    // the same way the Rust browser sorting does (strip "The ", drop
    // non-alphanumeric, lowercase).
    queries::register_sort_key(&conn)?;

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
    let _ = conn
        .execute_batch("CREATE INDEX IF NOT EXISTS idx_tracks_modified_at ON tracks(modified_at)");
    let _ = conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_tracks_album_artist_album \
         ON tracks(album_artist COLLATE NOCASE, album COLLATE NOCASE)",
    );
    let _ = conn.execute_batch("ALTER TABLE tracks ADD COLUMN last_played INTEGER");
    let _ = conn
        .execute_batch("CREATE INDEX IF NOT EXISTS idx_tracks_last_played ON tracks(last_played)");
    let _ = conn.execute_batch("ALTER TABLE tracks ADD COLUMN lyrics TEXT");
    let _ = conn.execute_batch("ALTER TABLE tracks ADD COLUMN synced_lyrics TEXT");
    let _ = conn
        .execute_batch("ALTER TABLE tracks ADD COLUMN lyrics_not_found INTEGER NOT NULL DEFAULT 0");

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

    // Last.fm scrobble queue (offline retry)
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS scrobble_queue (
            id INTEGER PRIMARY KEY,
            artist TEXT NOT NULL,
            track TEXT NOT NULL,
            album TEXT,
            album_artist TEXT,
            duration_secs INTEGER NOT NULL,
            timestamp INTEGER NOT NULL,
            created_at INTEGER NOT NULL DEFAULT 0
        );",
    )
    .map_err(|e| format!("Failed to create scrobble_queue table: {}", e))?;

    // Playback queue persistence table
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS playback_queue (
            position INTEGER PRIMARY KEY,
            track_id INTEGER NOT NULL,
            FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE
        );",
    )
    .map_err(|e| format!("Failed to create playback_queue table: {}", e))?;

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
            "Recently Played",
            "headphones",
            r#"{"match":"all","rules":[{"field":"last_played","operator":"greater_than","value":"0"}]}"#,
            "last_played",
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
