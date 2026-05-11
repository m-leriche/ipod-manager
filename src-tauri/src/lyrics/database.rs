use rusqlite::{params, Connection};

use super::tags::write_lyrics_to_file;
use super::TrackLyrics;

/// Get lyrics for a track from the database.
pub fn get_lyrics(conn: &Connection, track_id: i64) -> Result<TrackLyrics, String> {
    conn.query_row(
        "SELECT id, lyrics, synced_lyrics FROM tracks WHERE id = ?1",
        params![track_id],
        |row| {
            Ok(TrackLyrics {
                track_id: row.get(0)?,
                lyrics: row.get(1)?,
                synced_lyrics: row.get(2)?,
                source: "database".to_string(),
            })
        },
    )
    .map_err(|e| format!("Track not found: {}", e))
}

/// Save lyrics to the database for a track.
pub fn save_lyrics(
    conn: &Connection,
    track_id: i64,
    lyrics: Option<&str>,
    synced_lyrics: Option<&str>,
) -> Result<(), String> {
    conn.execute(
        "UPDATE tracks SET lyrics = ?1, synced_lyrics = ?2, lyrics_not_found = 0 WHERE id = ?3",
        params![lyrics, synced_lyrics, track_id],
    )
    .map_err(|e| format!("Failed to save lyrics: {}", e))?;

    Ok(())
}

/// Count how many tracks are marked as lyrics_not_found.
pub fn count_lyrics_not_found(conn: &Connection) -> usize {
    conn.query_row(
        "SELECT COUNT(*) FROM tracks WHERE lyrics_not_found = 1",
        params![],
        |row| row.get::<_, usize>(0),
    )
    .unwrap_or(0)
}

/// Reset lyrics_not_found flag so those tracks can be retried.
pub fn reset_lyrics_not_found(conn: &Connection) -> Result<usize, String> {
    conn.execute(
        "UPDATE tracks SET lyrics_not_found = 0 WHERE lyrics_not_found = 1",
        params![],
    )
    .map_err(|e| format!("Failed to reset lyrics_not_found: {}", e))
}

/// Remove lyrics from the database and strip embedded tags from the audio file.
pub fn remove_lyrics(conn: &Connection, track_id: i64, file_path: &str) -> Result<(), String> {
    save_lyrics(conn, track_id, None, None)?;
    let _ = write_lyrics_to_file(file_path, "");
    Ok(())
}
