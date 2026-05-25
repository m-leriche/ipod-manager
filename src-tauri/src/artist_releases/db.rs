use rusqlite::{params, Connection};
use std::time::{SystemTime, UNIX_EPOCH};

use super::types::{DiscoveredRelease, MatchStatus, WatchedArtist};

fn now_epoch() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

pub fn get_watched_artists(conn: &Connection) -> Result<Vec<WatchedArtist>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, mb_artist_id, mb_artist_name, match_status, created_at, last_checked_at
             FROM watched_artists ORDER BY name COLLATE NOCASE",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(WatchedArtist {
                id: row.get(0)?,
                name: row.get(1)?,
                mb_artist_id: row.get(2)?,
                mb_artist_name: row.get(3)?,
                match_status: row.get(4)?,
                created_at: row.get(5)?,
                last_checked_at: row.get(6)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    let mut artists = Vec::new();
    for a in rows.flatten() {
        artists.push(a);
    }
    Ok(artists)
}

pub fn add_watched_artist(conn: &Connection, name: &str) -> Result<WatchedArtist, String> {
    let now = now_epoch();
    conn.execute(
        "INSERT OR IGNORE INTO watched_artists (name, created_at, last_checked_at) VALUES (?1, ?2, 0)",
        params![name, now],
    )
    .map_err(|e| format!("Failed to insert watched artist: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, mb_artist_id, mb_artist_name, match_status, created_at, last_checked_at
             FROM watched_artists WHERE name = ?1",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    stmt.query_row(params![name], |row| {
        Ok(WatchedArtist {
            id: row.get(0)?,
            name: row.get(1)?,
            mb_artist_id: row.get(2)?,
            mb_artist_name: row.get(3)?,
            match_status: row.get(4)?,
            created_at: row.get(5)?,
            last_checked_at: row.get(6)?,
        })
    })
    .map_err(|e| format!("Failed to fetch watched artist: {}", e))
}

pub fn remove_watched_artist(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM watched_artists WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to remove watched artist: {}", e))?;
    Ok(())
}

pub fn is_artist_watched(conn: &Connection, name: &str) -> bool {
    conn.query_row(
        "SELECT COUNT(*) FROM watched_artists WHERE name = ?1",
        params![name],
        |row| row.get::<_, i64>(0),
    )
    .unwrap_or(0)
        > 0
}

pub fn set_artist_mbid(
    conn: &Connection,
    id: i64,
    mbid: &str,
    mb_name: &str,
    status: MatchStatus,
) -> Result<(), String> {
    conn.execute(
        "UPDATE watched_artists SET mb_artist_id = ?1, mb_artist_name = ?2, match_status = ?3 WHERE id = ?4",
        params![mbid, mb_name, status, id],
    )
    .map_err(|e| format!("Failed to set artist MBID: {}", e))?;
    Ok(())
}

pub fn update_last_checked(conn: &Connection, id: i64) -> Result<(), String> {
    let now = now_epoch();
    conn.execute(
        "UPDATE watched_artists SET last_checked_at = ?1 WHERE id = ?2",
        params![now, id],
    )
    .map_err(|e| format!("Failed to update last_checked_at: {}", e))?;
    Ok(())
}

/// Upsert a discovered release. Returns true if newly inserted.
pub fn upsert_discovered_release(
    conn: &Connection,
    watched_artist_id: i64,
    mb_release_group_id: &str,
    title: &str,
    artist_name: &str,
    release_type: Option<&str>,
    first_release_date: Option<&str>,
) -> Result<bool, String> {
    let now = now_epoch();
    let changes = conn
        .execute(
            "INSERT OR IGNORE INTO discovered_releases
             (watched_artist_id, mb_release_group_id, title, artist_name, release_type, first_release_date, discovered_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                watched_artist_id,
                mb_release_group_id,
                title,
                artist_name,
                release_type,
                first_release_date,
                now
            ],
        )
        .map_err(|e| format!("Failed to upsert release: {}", e))?;
    Ok(changes > 0)
}

pub fn get_discovered_releases(
    conn: &Connection,
    include_dismissed: bool,
) -> Result<Vec<DiscoveredRelease>, String> {
    let sql = if include_dismissed {
        "SELECT id, watched_artist_id, mb_release_group_id, title, artist_name, release_type,
                first_release_date, discovered_at, dismissed, in_library
         FROM discovered_releases
         ORDER BY first_release_date DESC, discovered_at DESC"
    } else {
        "SELECT id, watched_artist_id, mb_release_group_id, title, artist_name, release_type,
                first_release_date, discovered_at, dismissed, in_library
         FROM discovered_releases
         WHERE dismissed = 0
         ORDER BY first_release_date DESC, discovered_at DESC"
    };

    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(DiscoveredRelease {
                id: row.get(0)?,
                watched_artist_id: row.get(1)?,
                mb_release_group_id: row.get(2)?,
                title: row.get(3)?,
                artist_name: row.get(4)?,
                release_type: row.get(5)?,
                first_release_date: row.get(6)?,
                discovered_at: row.get(7)?,
                dismissed: row.get::<_, i64>(8)? != 0,
                in_library: row.get::<_, i64>(9)? != 0,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    let mut releases = Vec::new();
    for r in rows.flatten() {
        releases.push(r);
    }
    Ok(releases)
}

pub fn dismiss_release(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute(
        "UPDATE discovered_releases SET dismissed = 1 WHERE id = ?1",
        params![id],
    )
    .map_err(|e| format!("Failed to dismiss release: {}", e))?;
    Ok(())
}

pub fn mark_in_library(conn: &Connection, id: i64, in_library: bool) -> Result<(), String> {
    conn.execute(
        "UPDATE discovered_releases SET in_library = ?1 WHERE id = ?2",
        params![in_library as i64, id],
    )
    .map_err(|e| format!("Failed to update in_library: {}", e))?;
    Ok(())
}

/// Clear all discovered releases (for re-checking with updated filters).
pub fn clear_discovered_releases(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM discovered_releases", [])
        .map_err(|e| format!("Failed to clear releases: {}", e))?;
    // Reset last_checked_at so all artists are re-fetched
    conn.execute("UPDATE watched_artists SET last_checked_at = 0", [])
        .map_err(|e| format!("Failed to reset last_checked_at: {}", e))?;
    Ok(())
}

/// Get all local album + artist pairs for cross-referencing.
pub fn get_local_albums(conn: &Connection) -> Result<Vec<(String, String)>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT album, COALESCE(album_artist, artist) as display_artist
             FROM tracks
             WHERE album IS NOT NULL AND album != ''
               AND COALESCE(album_artist, artist) IS NOT NULL
               AND COALESCE(album_artist, artist) != ''",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    let mut albums = Vec::new();
    for pair in rows.flatten() {
        albums.push(pair);
    }
    Ok(albums)
}

/// Get artist names that have at least one undismissed, not-in-library release.
pub fn get_new_release_artist_names(conn: &Connection) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT w.name
             FROM watched_artists w
             JOIN discovered_releases d ON d.watched_artist_id = w.id
             WHERE d.dismissed = 0 AND d.in_library = 0",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Query failed: {}", e))?;

    let mut names = Vec::new();
    for name in rows.flatten() {
        names.push(name);
    }
    Ok(names)
}
