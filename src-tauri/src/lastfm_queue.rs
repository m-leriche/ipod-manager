use crate::lastfm::ScrobbleEntry;
use rusqlite::{params, Connection};
use std::time::{SystemTime, UNIX_EPOCH};

/// Add a scrobble to the offline retry queue.
pub fn enqueue(conn: &Connection, entry: &ScrobbleEntry) -> Result<(), String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    conn.execute(
        "INSERT INTO scrobble_queue (artist, track, album, album_artist, duration_secs, timestamp, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            entry.artist,
            entry.track,
            entry.album,
            entry.album_artist,
            entry.duration_secs,
            entry.timestamp,
            now,
        ],
    )
    .map_err(|e| format!("Failed to enqueue scrobble: {}", e))?;
    Ok(())
}

/// Fetch the oldest `limit` pending scrobbles, returning their row IDs and data.
pub fn dequeue_batch(conn: &Connection, limit: usize) -> Result<Vec<(i64, ScrobbleEntry)>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, artist, track, album, album_artist, duration_secs, timestamp
             FROM scrobble_queue ORDER BY timestamp ASC LIMIT ?1",
        )
        .map_err(|e| format!("Failed to prepare dequeue query: {}", e))?;

    let rows = stmt
        .query_map(params![limit as i64], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                ScrobbleEntry {
                    artist: row.get(1)?,
                    track: row.get(2)?,
                    album: row.get(3)?,
                    album_artist: row.get(4)?,
                    duration_secs: row.get(5)?,
                    timestamp: row.get(6)?,
                },
            ))
        })
        .map_err(|e| format!("Failed to query scrobble queue: {}", e))?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| format!("Failed to read queue row: {}", e))?);
    }
    Ok(results)
}

/// Remove successfully submitted scrobbles by their row IDs.
pub fn remove_by_ids(conn: &Connection, ids: &[i64]) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }

    let placeholders: Vec<String> = ids.iter().map(|_| "?".to_string()).collect();
    let sql = format!(
        "DELETE FROM scrobble_queue WHERE id IN ({})",
        placeholders.join(", ")
    );

    let params: Vec<Box<dyn rusqlite::types::ToSql>> = ids
        .iter()
        .map(|id| Box::new(*id) as Box<dyn rusqlite::types::ToSql>)
        .collect();

    conn.execute(
        &sql,
        params
            .iter()
            .map(|p| p.as_ref())
            .collect::<Vec<_>>()
            .as_slice(),
    )
    .map_err(|e| format!("Failed to remove scrobbles from queue: {}", e))?;

    Ok(())
}

/// Count pending scrobbles in the queue.
pub fn queue_count(conn: &Connection) -> Result<usize, String> {
    conn.query_row("SELECT COUNT(*) FROM scrobble_queue", [], |row| {
        row.get::<_, i64>(0)
    })
    .map(|c| c as usize)
    .map_err(|e| format!("Failed to count scrobble queue: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE scrobble_queue (
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
        .unwrap();
        conn
    }

    fn make_entry(artist: &str, track: &str, ts: i64) -> ScrobbleEntry {
        ScrobbleEntry {
            artist: artist.to_string(),
            track: track.to_string(),
            album: Some("Album".to_string()),
            album_artist: None,
            duration_secs: 200,
            timestamp: ts,
        }
    }

    #[test]
    fn enqueue_and_dequeue() {
        let conn = setup_db();
        enqueue(&conn, &make_entry("Artist A", "Track 1", 1000)).unwrap();
        enqueue(&conn, &make_entry("Artist B", "Track 2", 2000)).unwrap();

        let batch = dequeue_batch(&conn, 10).unwrap();
        assert_eq!(batch.len(), 2);
        assert_eq!(batch[0].1.artist, "Artist A");
        assert_eq!(batch[1].1.artist, "Artist B");
    }

    #[test]
    fn remove_by_ids_clears_entries() {
        let conn = setup_db();
        enqueue(&conn, &make_entry("A", "T1", 1000)).unwrap();
        enqueue(&conn, &make_entry("B", "T2", 2000)).unwrap();
        enqueue(&conn, &make_entry("C", "T3", 3000)).unwrap();

        let batch = dequeue_batch(&conn, 10).unwrap();
        let ids: Vec<i64> = batch.iter().take(2).map(|(id, _)| *id).collect();
        remove_by_ids(&conn, &ids).unwrap();

        assert_eq!(queue_count(&conn).unwrap(), 1);
        let remaining = dequeue_batch(&conn, 10).unwrap();
        assert_eq!(remaining[0].1.artist, "C");
    }

    #[test]
    fn queue_count_empty() {
        let conn = setup_db();
        assert_eq!(queue_count(&conn).unwrap(), 0);
    }

    #[test]
    fn remove_empty_ids_is_ok() {
        let conn = setup_db();
        assert!(remove_by_ids(&conn, &[]).is_ok());
    }

    #[test]
    fn dequeue_respects_limit() {
        let conn = setup_db();
        for i in 0..5 {
            enqueue(&conn, &make_entry("A", &format!("T{i}"), 1000 + i)).unwrap();
        }
        let batch = dequeue_batch(&conn, 3).unwrap();
        assert_eq!(batch.len(), 3);
    }
}
