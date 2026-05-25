use rusqlite::{params, Connection};
use std::time::{SystemTime, UNIX_EPOCH};

use super::types::DiscoverSection;

const CACHE_TTL_SECS: i64 = 24 * 60 * 60;
const SNAPSHOT_KEY: &str = "discover_snapshot";

fn now_epoch() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

pub fn get_cached(conn: &Connection, key: &str) -> Option<String> {
    let cutoff = now_epoch() - CACHE_TTL_SECS;
    conn.query_row(
        "SELECT data_json FROM discover_cache WHERE cache_key = ?1 AND cached_at > ?2",
        params![key, cutoff],
        |row| row.get(0),
    )
    .ok()
}

pub fn set_cached(conn: &Connection, key: &str, data: &str) {
    let _ = conn.execute(
        "INSERT INTO discover_cache (cache_key, data_json, cached_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(cache_key) DO UPDATE SET data_json = excluded.data_json, cached_at = excluded.cached_at",
        params![key, data, now_epoch()],
    );
}

pub fn clear_feed_cache(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "DELETE FROM discover_cache WHERE cache_key LIKE 'feed:%'",
        [],
    )
    .map_err(|e| format!("Failed to clear discover cache: {}", e))?;
    Ok(())
}

// ── Feed snapshot (persists until explicit refresh) ─────────────

pub fn get_feed_snapshot(conn: &Connection) -> Option<Vec<DiscoverSection>> {
    conn.query_row(
        "SELECT data_json FROM discover_cache WHERE cache_key = ?1",
        params![SNAPSHOT_KEY],
        |row| row.get::<_, String>(0),
    )
    .ok()
    .and_then(|json| serde_json::from_str(&json).ok())
}

pub fn save_feed_snapshot(conn: &Connection, sections: &[DiscoverSection]) {
    if let Ok(json) = serde_json::to_string(sections) {
        set_cached(conn, SNAPSHOT_KEY, &json);
    }
}

pub fn clear_feed_snapshot(conn: &Connection) {
    let _ = conn.execute(
        "DELETE FROM discover_cache WHERE cache_key = ?1",
        params![SNAPSHOT_KEY],
    );
}
