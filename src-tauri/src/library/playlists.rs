use rusqlite::Connection;

use super::now_epoch;
use super::types::{LibraryTrack, Playlist, PlaylistTrack};

/// Row mapper shared by all queries that SELECT from the tracks table.
fn map_track(row: &rusqlite::Row, offset: usize) -> rusqlite::Result<LibraryTrack> {
    Ok(LibraryTrack {
        id: row.get(offset)?,
        file_path: row.get(offset + 1)?,
        file_name: row.get(offset + 2)?,
        folder_path: row.get(offset + 3)?,
        title: row.get(offset + 4)?,
        artist: row.get(offset + 5)?,
        album: row.get(offset + 6)?,
        album_artist: row.get(offset + 7)?,
        sort_artist: row.get(offset + 8)?,
        sort_album_artist: row.get(offset + 9)?,
        track_number: row.get(offset + 10)?,
        track_total: row.get(offset + 11)?,
        disc_number: row.get(offset + 12)?,
        disc_total: row.get(offset + 13)?,
        year: row.get(offset + 14)?,
        genre: row.get(offset + 15)?,
        duration_secs: row.get(offset + 16)?,
        sample_rate: row.get(offset + 17)?,
        bitrate_kbps: row.get(offset + 18)?,
        format: row.get(offset + 19)?,
        file_size: row.get::<_, i64>(offset + 20).map(|v| v as u64)?,
        created_at: row.get(offset + 21)?,
        play_count: row.get::<_, i64>(offset + 22).map(|v| v as u32)?,
        flagged: row.get(offset + 23)?,
        rating: row.get::<_, i64>(offset + 24).map(|v| v as u8)?,
    })
}

// ── Playlist CRUD ─────────────────────────────────────────────

pub fn get_playlists(conn: &Connection) -> Result<Vec<Playlist>, String> {
    let sql = "SELECT p.id, p.name, p.created_at, p.updated_at,
                      COALESCE(s.cnt, 0) AS track_count,
                      COALESCE(s.dur, 0.0) AS total_duration
               FROM playlists p
               LEFT JOIN (
                   SELECT pt.playlist_id,
                          COUNT(*) AS cnt,
                          SUM(t.duration_secs) AS dur
                   FROM playlist_tracks pt
                   JOIN tracks t ON t.id = pt.track_id
                   GROUP BY pt.playlist_id
               ) s ON s.playlist_id = p.id
               ORDER BY p.name COLLATE NOCASE";

    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("Query failed: {}", e))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Playlist {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
                track_count: row.get::<_, i64>(4).map(|v| v as u32)?,
                total_duration: row.get(5)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row read failed: {}", e))
}

pub fn create_playlist(conn: &Connection, name: &str) -> Result<Playlist, String> {
    let now = now_epoch();
    conn.execute(
        "INSERT INTO playlists (name, created_at, updated_at) VALUES (?1, ?2, ?3)",
        rusqlite::params![name, now, now],
    )
    .map_err(|e| format!("Failed to create playlist: {}", e))?;

    let id = conn.last_insert_rowid();
    Ok(Playlist {
        id,
        name: name.to_string(),
        track_count: 0,
        total_duration: 0.0,
        created_at: now,
        updated_at: now,
    })
}

pub fn rename_playlist(conn: &Connection, id: i64, name: &str) -> Result<(), String> {
    let now = now_epoch();
    let changed = conn
        .execute(
            "UPDATE playlists SET name = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![name, now, id],
        )
        .map_err(|e| format!("Failed to rename playlist: {}", e))?;

    if changed == 0 {
        return Err("Playlist not found".into());
    }
    Ok(())
}

pub fn delete_playlist(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM playlists WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| format!("Failed to delete playlist: {}", e))?;
    Ok(())
}

// ── Playlist tracks ───────────────────────────────────────────

pub fn get_playlist_tracks(
    conn: &Connection,
    playlist_id: i64,
) -> Result<Vec<PlaylistTrack>, String> {
    let sql = "SELECT pt.position,
                      t.id, t.file_path, t.file_name, t.folder_path, t.title, t.artist,
                      t.album, t.album_artist, t.sort_artist, t.sort_album_artist,
                      t.track_number, t.track_total, t.disc_number, t.disc_total, t.year,
                      t.genre, t.duration_secs, t.sample_rate, t.bitrate_kbps, t.format,
                      t.file_size, t.created_at, t.play_count, t.flagged, t.rating
               FROM playlist_tracks pt
               JOIN tracks t ON t.id = pt.track_id
               WHERE pt.playlist_id = ?1
               ORDER BY pt.position";

    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("Query failed: {}", e))?;
    let rows = stmt
        .query_map(rusqlite::params![playlist_id], |row| {
            Ok(PlaylistTrack {
                position: row.get::<_, i64>(0).map(|v| v as u32)?,
                track: map_track(row, 1)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row read failed: {}", e))
}

pub fn add_tracks_to_playlist(
    conn: &Connection,
    playlist_id: i64,
    track_ids: &[i64],
) -> Result<(), String> {
    if track_ids.is_empty() {
        return Ok(());
    }

    // Get current max position
    let max_pos: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(position), -1) FROM playlist_tracks WHERE playlist_id = ?1",
            rusqlite::params![playlist_id],
            |row| row.get(0),
        )
        .unwrap_or(-1);

    let mut pos = max_pos + 1;
    let mut stmt = conn
        .prepare("INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, ?3)")
        .map_err(|e| format!("Prepare failed: {}", e))?;

    for &track_id in track_ids {
        if stmt
            .execute(rusqlite::params![playlist_id, track_id, pos])
            .map_err(|e| format!("Insert failed: {}", e))?
            > 0
        {
            pos += 1;
        }
    }

    touch_playlist(conn, playlist_id);
    Ok(())
}

pub fn remove_tracks_from_playlist(
    conn: &Connection,
    playlist_id: i64,
    track_ids: &[i64],
) -> Result<(), String> {
    if track_ids.is_empty() {
        return Ok(());
    }

    let placeholders: Vec<String> = track_ids
        .iter()
        .enumerate()
        .map(|(i, _)| format!("?{}", i + 2))
        .collect();
    let sql = format!(
        "DELETE FROM playlist_tracks WHERE playlist_id = ?1 AND track_id IN ({})",
        placeholders.join(", ")
    );

    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    params.push(Box::new(playlist_id));
    for &id in track_ids {
        params.push(Box::new(id));
    }

    let params_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, params_refs.as_slice())
        .map_err(|e| format!("Delete failed: {}", e))?;

    // Recompact positions
    reorder_positions(conn, playlist_id)?;
    touch_playlist(conn, playlist_id);
    Ok(())
}

pub fn move_playlist_track(
    conn: &Connection,
    playlist_id: i64,
    from_position: u32,
    to_position: u32,
) -> Result<(), String> {
    if from_position == to_position {
        return Ok(());
    }

    // Get track_id at from_position
    let track_id: i64 = conn
        .query_row(
            "SELECT track_id FROM playlist_tracks WHERE playlist_id = ?1 AND position = ?2",
            rusqlite::params![playlist_id, from_position],
            |row| row.get(0),
        )
        .map_err(|_| "Track not found at position".to_string())?;

    if from_position < to_position {
        conn.execute(
            "UPDATE playlist_tracks SET position = position - 1
             WHERE playlist_id = ?1 AND position > ?2 AND position <= ?3",
            rusqlite::params![playlist_id, from_position, to_position],
        )
        .map_err(|e| format!("Reorder failed: {}", e))?;
    } else {
        conn.execute(
            "UPDATE playlist_tracks SET position = position + 1
             WHERE playlist_id = ?1 AND position >= ?2 AND position < ?3",
            rusqlite::params![playlist_id, to_position, from_position],
        )
        .map_err(|e| format!("Reorder failed: {}", e))?;
    }

    conn.execute(
        "UPDATE playlist_tracks SET position = ?1 WHERE playlist_id = ?2 AND track_id = ?3",
        rusqlite::params![to_position, playlist_id, track_id],
    )
    .map_err(|e| format!("Reorder failed: {}", e))?;

    touch_playlist(conn, playlist_id);
    Ok(())
}

// ── Helpers ───────────────────────────────────────────────────

fn touch_playlist(conn: &Connection, playlist_id: i64) {
    let now = now_epoch();
    let _ = conn.execute(
        "UPDATE playlists SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![now, playlist_id],
    );
}

fn reorder_positions(conn: &Connection, playlist_id: i64) -> Result<(), String> {
    let mut stmt = conn
        .prepare("SELECT id FROM playlist_tracks WHERE playlist_id = ?1 ORDER BY position")
        .map_err(|e| format!("Query failed: {}", e))?;

    let ids: Vec<i64> = stmt
        .query_map(rusqlite::params![playlist_id], |row| row.get(0))
        .map_err(|e| format!("Query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row read failed: {}", e))?;

    let mut update = conn
        .prepare("UPDATE playlist_tracks SET position = ?1 WHERE id = ?2")
        .map_err(|e| format!("Prepare failed: {}", e))?;

    for (i, id) in ids.iter().enumerate() {
        update
            .execute(rusqlite::params![i as i64, id])
            .map_err(|e| format!("Update failed: {}", e))?;
    }
    Ok(())
}
