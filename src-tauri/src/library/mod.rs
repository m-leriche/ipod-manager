pub mod backup;
mod delete;
pub mod duplicates;
pub mod export;
mod folders;
pub mod health;
mod import;
mod indexing;
pub mod playlists;
mod queries;
mod reorganize;
mod scan;
mod schema;
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
use unicode_normalization::UnicodeNormalization;

// ── Re-exports (preserve public API) ───────────────────────────

pub use delete::delete_tracks;
pub use folders::{add_folder, get_folders, remove_folder};
pub(crate) use import::compute_library_dest;
pub use import::import_to_library;
pub(crate) use queries::genre::split_genres;
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

/// Shared writer-connection handle. Scan and import lock this per step —
/// releasing it during slow tag reads and file copies — so they don't block
/// every other writer (metadata saves, lyrics, playlists, backups) for the
/// full duration of the operation.
pub(crate) type SharedConn = std::sync::Arc<std::sync::Mutex<Connection>>;

pub(crate) fn lock_shared(
    conn: &SharedConn,
) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
    conn.lock().map_err(|e| format!("DB lock failed: {}", e))
}

pub struct LibraryDb {
    pub conn: std::sync::Arc<std::sync::Mutex<Connection>>,
    db_path: std::path::PathBuf,
}

impl LibraryDb {
    pub fn new(conn: Connection, db_path: std::path::PathBuf) -> Self {
        Self {
            conn: std::sync::Arc::new(std::sync::Mutex::new(conn)),
            db_path,
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

    /// Run a read-only closure on its own connection, bypassing the writer's
    /// mutex entirely. WAL mode lets readers run concurrently with writes,
    /// so browsing stays responsive during long saves and scans.
    pub async fn with_read_db<F, T, E>(&self, f: F) -> Result<T, crate::error::AppError>
    where
        F: FnOnce(&Connection) -> Result<T, E> + Send + 'static,
        T: Send + 'static,
        E: Into<crate::error::AppError> + Send + 'static,
    {
        let db_path = self.db_path.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let conn = open_read_conn(&db_path).map_err(crate::error::AppError::Generic)?;
            f(&conn).map_err(Into::into)
        })
        .await
        .map_err(|e| crate::error::AppError::Generic(format!("Task failed: {}", e)))?
    }
}

/// Open an independent read-only SQLite connection.
///
/// WAL mode (set by `init_db`) allows unlimited concurrent readers that never
/// block on the writer. `query_only` prevents accidental writes from
/// read-only callers. The `sort_key` SQL function is registered for ORDER BY.
pub fn open_read_conn(db_path: &Path) -> Result<Connection, String> {
    let conn = Connection::open_with_flags(
        db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("DB open: {e}"))?;
    conn.execute_batch("PRAGMA query_only = ON;")
        .map_err(|e| format!("pragma: {e}"))?;
    register_sort_key(&conn)?;
    Ok(conn)
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

    // Catch page-level corruption before any schema work touches the file.
    schema::verify_integrity(&conn)?;

    // Register sort_key() as a SQL scalar so ORDER BY can normalise strings
    // the same way the Rust browser sorting does (strip "The ", drop
    // non-alphanumeric, lowercase).
    queries::register_sort_key(&conn)?;

    schema::create_tables(&conn)?;
    schema::migrate(&conn)?;

    // Derived sort-key columns + FTS index (trigger-maintained, one-time backfill).
    indexing::install(&conn)?;

    // One-time cleanup of pre-normalization NFD duplicate rows (flag-guarded,
    // so it costs one settings read on every launch after the first).
    if let Err(e) = scan::run_nfc_dedup_once(&conn) {
        log::warn!("NFC dedup migration failed (non-fatal): {}", e);
    }

    schema::seed_builtin_smart_playlists(&conn);

    Ok(conn)
}

// ── Helpers ────────────────────────────────────────────────────

/// Returns true if the DB path is a ghost: either the file doesn't exist,
/// or it exists only because the filesystem is case-insensitive (macOS APFS)
/// and the real on-disk casing differs from what the DB recorded AND a
/// replacement record already exists at the canonical path.
///
/// The "replacement must exist" guard prevents deleting the only record for a
/// file when the canonical path differs due to Unicode normalization (NFC vs
/// NFD on HFS+), symlink resolution, or other path transformations.
pub(crate) fn is_ghost_path(db_path: &str, conn: &Connection) -> bool {
    let p = Path::new(db_path);
    match p.try_exists() {
        Ok(false) => return true,
        // Transient stat failure (permissions, a volume mid-disconnect) —
        // treat the file as present rather than risk deleting a live row.
        Err(_) => return false,
        Ok(true) => {}
    }
    let canon = match p.canonicalize() {
        Ok(c) => c,
        Err(_) => return false,
    };
    let canon_nfc: String = canon.to_string_lossy().nfc().collect();
    let db_nfc: String = db_path.nfc().collect();
    if canon_nfc == db_nfc {
        return false;
    }
    // The canonical path differs (e.g. case change, NFD/NFC, symlink).
    // Only flag as ghost if a record already exists at the canonical path —
    // otherwise we'd delete the only record for this file and lose created_at.
    conn.query_row(
        "SELECT 1 FROM tracks WHERE file_path = ?1",
        rusqlite::params![canon_nfc],
        |_| Ok(true),
    )
    .unwrap_or(false)
}

fn now_epoch() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
