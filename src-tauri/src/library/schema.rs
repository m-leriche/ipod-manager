//! Table creation and versioned migrations for the library database.
//!
//! `create_tables` is idempotent (`IF NOT EXISTS`). `migrate` is gated on
//! `PRAGMA user_version` and — unlike the old unversioned `let _ = ALTER …`
//! wall — surfaces real failures (disk full, locks) instead of silently
//! leaving the schema half-migrated. "Duplicate column" errors are tolerated
//! because pre-versioning databases already have an arbitrary subset applied.

use rusqlite::Connection;

use super::now_epoch;

/// Bump when adding a migration step below.
const SCHEMA_VERSION: i64 = 2;

pub(super) fn create_tables(conn: &Connection) -> Result<(), String> {
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

        CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist ON playlist_tracks(playlist_id, position);

        CREATE TABLE IF NOT EXISTS smart_playlists (
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
        );

        CREATE TABLE IF NOT EXISTS scrobble_queue (
            id INTEGER PRIMARY KEY,
            artist TEXT NOT NULL,
            track TEXT NOT NULL,
            album TEXT,
            album_artist TEXT,
            duration_secs INTEGER NOT NULL,
            timestamp INTEGER NOT NULL,
            created_at INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS watched_artists (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            mb_artist_id TEXT,
            mb_artist_name TEXT,
            match_status TEXT NOT NULL DEFAULT 'pending',
            created_at INTEGER NOT NULL DEFAULT 0,
            last_checked_at INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS discovered_releases (
            id INTEGER PRIMARY KEY,
            watched_artist_id INTEGER NOT NULL,
            mb_release_group_id TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            artist_name TEXT NOT NULL,
            release_type TEXT,
            first_release_date TEXT,
            discovered_at INTEGER NOT NULL DEFAULT 0,
            dismissed INTEGER NOT NULL DEFAULT 0,
            in_library INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY(watched_artist_id) REFERENCES watched_artists(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_discovered_releases_artist ON discovered_releases(watched_artist_id);

        CREATE TABLE IF NOT EXISTS discover_cache (
            cache_key TEXT PRIMARY KEY,
            data_json TEXT NOT NULL,
            cached_at INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS playback_queue (
            position INTEGER PRIMARY KEY,
            track_id INTEGER NOT NULL,
            FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE
        );",
    )
    .map_err(|e| format!("Failed to create tables: {}", e))
}

pub(super) fn migrate(conn: &Connection) -> Result<(), String> {
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(|e| format!("Failed to read schema version: {}", e))?;

    if version < 1 {
        for ddl in [
            "ALTER TABLE tracks ADD COLUMN disc_total INTEGER",
            "ALTER TABLE tracks ADD COLUMN play_count INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE tracks ADD COLUMN flagged INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE tracks ADD COLUMN rating INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE tracks ADD COLUMN last_played INTEGER",
            "ALTER TABLE tracks ADD COLUMN replay_gain_track_db REAL",
            "ALTER TABLE tracks ADD COLUMN replay_gain_album_db REAL",
            "ALTER TABLE tracks ADD COLUMN lyrics TEXT",
            "ALTER TABLE tracks ADD COLUMN synced_lyrics TEXT",
            "ALTER TABLE tracks ADD COLUMN lyrics_not_found INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE tracks ADD COLUMN compilation INTEGER NOT NULL DEFAULT 0",
        ] {
            add_column(conn, ddl)?;
        }
        conn.execute_batch(
            "CREATE INDEX IF NOT EXISTS idx_tracks_rating ON tracks(rating);
             CREATE INDEX IF NOT EXISTS idx_tracks_modified_at ON tracks(modified_at);
             CREATE INDEX IF NOT EXISTS idx_tracks_album_artist_album
                 ON tracks(album_artist COLLATE NOCASE, album COLLATE NOCASE);
             CREATE INDEX IF NOT EXISTS idx_tracks_last_played ON tracks(last_played);",
        )
        .map_err(|e| format!("Migration v1 index creation failed: {}", e))?;
    }

    if version < 2 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS quality_cache (
                file_path TEXT PRIMARY KEY,
                mtime INTEGER NOT NULL,
                file_size INTEGER NOT NULL,
                info_json TEXT NOT NULL
            );",
        )
        .map_err(|e| format!("Migration v2 failed: {}", e))?;
    }

    if version < SCHEMA_VERSION {
        conn.execute_batch(&format!("PRAGMA user_version = {SCHEMA_VERSION}"))
            .map_err(|e| format!("Failed to set schema version: {}", e))?;
    }
    Ok(())
}

/// Apply an ADD COLUMN, tolerating only the "already exists" case.
fn add_column(conn: &Connection, ddl: &str) -> Result<(), String> {
    match conn.execute_batch(ddl) {
        Ok(()) => Ok(()),
        Err(e) if e.to_string().contains("duplicate column name") => Ok(()),
        Err(e) => Err(format!("Migration failed ({ddl}): {e}")),
    }
}

/// Seed the built-in smart playlists (best-effort; INSERT OR IGNORE).
pub(super) fn seed_builtin_smart_playlists(conn: &Connection) {
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
}

/// Fail fast on page-level corruption before any schema work runs.
/// `quick_check` skips index-order verification, so it's launch-affordable.
pub(super) fn verify_integrity(conn: &Connection) -> Result<(), String> {
    let result: String = conn
        .query_row("PRAGMA quick_check(1)", [], |r| r.get(0))
        .map_err(|e| format!("Integrity check could not run: {}", e))?;
    if result == "ok" {
        Ok(())
    } else {
        Err(format!("Database integrity check failed: {}", result))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrate_sets_user_version_and_is_rerunnable() {
        let conn = Connection::open_in_memory().unwrap();
        create_tables(&conn).unwrap();
        migrate(&conn).unwrap();
        let v: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v, SCHEMA_VERSION);
        // Re-running (e.g. next launch) is a no-op, not an error.
        migrate(&conn).unwrap();
    }

    #[test]
    fn add_column_tolerates_existing_but_surfaces_real_errors() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE t (a INTEGER);").unwrap();
        add_column(&conn, "ALTER TABLE t ADD COLUMN b INTEGER").unwrap();
        // Duplicate: tolerated.
        add_column(&conn, "ALTER TABLE t ADD COLUMN b INTEGER").unwrap();
        // Broken DDL: surfaced.
        assert!(add_column(&conn, "ALTER TABLE missing ADD COLUMN c INTEGER").is_err());
    }

    #[test]
    fn verify_integrity_passes_on_healthy_db() {
        let conn = Connection::open_in_memory().unwrap();
        create_tables(&conn).unwrap();
        verify_integrity(&conn).unwrap();
    }
}
