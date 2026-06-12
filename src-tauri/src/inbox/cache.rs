use rusqlite::{params, Connection};

use super::types::{CheckResult, CheckStatus};

/// Persistent cache of MusicBrainz tracklist verdicts, keyed by what the
/// lookup depends on (artist, album, track count). An album only re-verifies
/// when its tags or track count change.
const ENSURE_TABLE: &str = "CREATE TABLE IF NOT EXISTS inbox_tracklist_cache (
    key TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    detail TEXT,
    checked_at INTEGER NOT NULL
)";

fn cache_key(artist: &str, album: &str, track_count: usize) -> String {
    format!(
        "{}|{}|{}",
        artist.to_lowercase(),
        album.to_lowercase(),
        track_count
    )
}

/// Cached fails expire so a wrong MB match (or later-corrected MB data) can't
/// block an album forever. Passes are stable and never expire.
const FAIL_TTL_SECS: i64 = 7 * 24 * 3600;

pub fn cached_tracklist(
    conn: &Connection,
    artist: &str,
    album: &str,
    track_count: usize,
) -> Option<CheckResult> {
    conn.execute(ENSURE_TABLE, []).ok()?;
    let (status, detail, checked_at): (String, Option<String>, i64) = conn
        .query_row(
            "SELECT status, detail, checked_at FROM inbox_tracklist_cache WHERE key = ?1",
            params![cache_key(artist, album, track_count)],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .ok()?;

    let status = match status.as_str() {
        "pass" => CheckStatus::Pass,
        "fail" if now_secs() - checked_at <= FAIL_TTL_SECS => CheckStatus::Fail,
        _ => return None,
    };
    Some(CheckResult { status, detail })
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

pub fn cache_tracklist(
    conn: &Connection,
    artist: &str,
    album: &str,
    track_count: usize,
    result: &CheckResult,
) {
    // Only definitive verdicts are cached — warns (MB unreachable, no match)
    // are transient and should retry on the next scan.
    let status = match result.status {
        CheckStatus::Pass => "pass",
        CheckStatus::Fail => "fail",
        _ => return,
    };
    if conn.execute(ENSURE_TABLE, []).is_err() {
        return;
    }
    let _ = conn.execute(
        "INSERT INTO inbox_tracklist_cache (key, status, detail, checked_at)
         VALUES (?1, ?2, ?3, strftime('%s','now'))
         ON CONFLICT(key) DO UPDATE SET
             status = excluded.status,
             detail = excluded.detail,
             checked_at = excluded.checked_at",
        params![cache_key(artist, album, track_count), status, result.detail],
    );
}
