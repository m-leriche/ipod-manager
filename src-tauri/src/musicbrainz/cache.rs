//! Persistent cache for MusicBrainz / Cover Art Archive responses, stored in
//! the library DB (`mb_cache` table). Entries expire after 30 days: expired
//! rows read as misses and are overwritten by the next `put`.

use rusqlite::{params, Connection};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

const CACHE_TTL_SECS: i64 = 30 * 24 * 60 * 60;

fn now_epoch() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

#[derive(Clone)]
pub struct MbCache {
    conn: Arc<Mutex<Connection>>,
}

impl MbCache {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }

    /// Read a cached response. Expired or missing entries return `None`.
    pub fn get(&self, key: &str) -> Option<String> {
        let conn = self.conn.lock().ok()?;
        let cutoff = now_epoch() - CACHE_TTL_SECS;
        conn.query_row(
            "SELECT response FROM mb_cache WHERE key = ?1 AND fetched_at > ?2",
            params![key, cutoff],
            |row| row.get(0),
        )
        .ok()
    }

    /// Store a response, overwriting any existing entry. Best-effort: a
    /// failed cache write must never fail the lookup that produced it.
    pub fn put(&self, key: &str, response: &str) {
        let Ok(conn) = self.conn.lock() else {
            return;
        };
        let _ = conn.execute(
            "INSERT INTO mb_cache (key, response, fetched_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET response = excluded.response, fetched_at = excluded.fetched_at",
            params![key, response, now_epoch()],
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_cache() -> MbCache {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE mb_cache (
                key TEXT PRIMARY KEY,
                response TEXT NOT NULL,
                fetched_at INTEGER NOT NULL DEFAULT 0
            );",
        )
        .unwrap();
        MbCache::new(Arc::new(Mutex::new(conn)))
    }

    #[test]
    fn miss_returns_none() {
        let cache = test_cache();
        assert_eq!(cache.get("release-search:a|b"), None);
    }

    #[test]
    fn put_then_get_hits() {
        let cache = test_cache();
        cache.put("k", "{\"releases\":[]}");
        assert_eq!(cache.get("k").as_deref(), Some("{\"releases\":[]}"));
    }

    #[test]
    fn put_overwrites_existing() {
        let cache = test_cache();
        cache.put("k", "old");
        cache.put("k", "new");
        assert_eq!(cache.get("k").as_deref(), Some("new"));
    }

    #[test]
    fn expired_entry_is_a_miss_and_gets_overwritten() {
        let cache = test_cache();
        let stale = now_epoch() - CACHE_TTL_SECS - 1;
        {
            let conn = cache.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO mb_cache (key, response, fetched_at) VALUES ('k', 'stale', ?1)",
                params![stale],
            )
            .unwrap();
        }
        assert_eq!(cache.get("k"), None);

        cache.put("k", "fresh");
        assert_eq!(cache.get("k").as_deref(), Some("fresh"));
    }

    #[test]
    fn entry_just_inside_ttl_still_hits() {
        let cache = test_cache();
        let recent = now_epoch() - CACHE_TTL_SECS + 60;
        {
            let conn = cache.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO mb_cache (key, response, fetched_at) VALUES ('k', 'ok', ?1)",
                params![recent],
            )
            .unwrap();
        }
        assert_eq!(cache.get("k").as_deref(), Some("ok"));
    }
}
