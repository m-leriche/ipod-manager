use crate::error::AppError;
use crate::library::types::LibraryTrack;
use crate::library::{self, row_to_track, LibraryDb, SELECT_COLUMNS};
use serde::{Deserialize, Serialize};
use tauri::State;

/// Serialized wire format returned by load_playback_queue.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueState {
    pub tracks: Vec<LibraryTrack>,
    pub queue_index: i64,
    pub shuffle: bool,
    pub repeat: String,
    pub position: f64,
}

#[tauri::command]
pub async fn save_playback_queue(
    track_ids: Vec<i64>,
    queue_index: i64,
    shuffle: bool,
    repeat: String,
    position: f64,
    db: State<'_, LibraryDb>,
) -> Result<(), AppError> {
    db.with_db(move |conn| {
        // unchecked_transaction is safe here: with_db holds an exclusive mutex
        // lock on the connection, so no concurrent transaction can exist.
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| format!("Transaction failed: {}", e))?;

        tx.execute("DELETE FROM playback_queue", [])
            .map_err(|e| format!("Clear queue failed: {}", e))?;

        let mut stmt = tx
            .prepare("INSERT INTO playback_queue (position, track_id) VALUES (?1, ?2)")
            .map_err(|e| format!("Prepare failed: {}", e))?;

        for (i, track_id) in track_ids.iter().enumerate() {
            stmt.execute(rusqlite::params![i as i64, track_id])
                .map_err(|e| format!("Insert queue track failed: {}", e))?;
        }
        drop(stmt);

        let meta = serde_json::json!({
            "queue_index": queue_index,
            "shuffle": shuffle,
            "repeat": repeat,
            "position": position,
        });
        library::set_setting(&tx, "playback_queue_state", &meta.to_string())?;

        tx.commit().map_err(|e| format!("Commit failed: {}", e))?;
        Ok::<_, String>(())
    })
    .await
}

#[tauri::command]
pub async fn load_playback_queue(db: State<'_, LibraryDb>) -> Result<Option<QueueState>, AppError> {
    db.with_db(move |conn| {
        let meta_json = library::get_setting(conn, "playback_queue_state");
        let meta_json = match meta_json {
            Some(json) => json,
            None => return Ok::<_, String>(None),
        };

        let meta: serde_json::Value = serde_json::from_str(&meta_json)
            .map_err(|e| format!("Invalid queue state JSON: {}", e))?;

        // Prefix each column with "t." for the JOIN query
        let prefixed_cols = SELECT_COLUMNS.replace('\n', "");
        let prefixed_cols = prefixed_cols
            .split(", ")
            .map(|col| format!("t.{}", col.trim()))
            .collect::<Vec<_>>()
            .join(", ");

        let sql = format!(
            "SELECT {} FROM playback_queue pq
             JOIN tracks t ON t.id = pq.track_id
             ORDER BY pq.position",
            prefixed_cols
        );

        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| format!("Query failed: {}", e))?;

        let tracks: Vec<LibraryTrack> = stmt
            .query_map([], row_to_track)
            .map_err(|e| format!("Query failed: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Row read failed: {}", e))?;

        if tracks.is_empty() {
            return Ok(None);
        }

        let queue_index = meta["queue_index"].as_i64().unwrap_or(-1);
        let shuffle = meta["shuffle"].as_bool().unwrap_or(false);
        let repeat = meta["repeat"].as_str().unwrap_or("off").to_string();
        let position = meta["position"].as_f64().unwrap_or(0.0);

        Ok(Some(QueueState {
            tracks,
            queue_index,
            shuffle,
            repeat,
            position,
        }))
    })
    .await
}

#[tauri::command]
pub async fn clear_playback_queue(db: State<'_, LibraryDb>) -> Result<(), AppError> {
    db.with_db(move |conn| {
        conn.execute("DELETE FROM playback_queue", [])
            .map_err(|e| format!("Clear queue failed: {}", e))?;
        library::delete_setting(conn, "playback_queue_state")?;
        Ok::<_, String>(())
    })
    .await
}
