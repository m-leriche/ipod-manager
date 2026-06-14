use tauri::State;

use crate::library::LibraryDb;
use crate::recommend::{self, TrackRecommendation};

const DEFAULT_LIMIT: usize = 24;

/// Recommend tracks for a playlist. Pass exactly one of `playlist_id` /
/// `smart_playlist_id`. Returns an empty list when neither is set, the
/// playlist is empty, or Last.fm is unreachable.
#[tauri::command]
pub async fn get_playlist_recommendations(
    playlist_id: Option<i64>,
    smart_playlist_id: Option<i64>,
    limit: Option<usize>,
    db: State<'_, LibraryDb>,
) -> Result<Vec<TrackRecommendation>, String> {
    if playlist_id.is_none() && smart_playlist_id.is_none() {
        return Ok(Vec::new());
    }
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        recommend::recommend_for_playlist(
            &conn_arc,
            playlist_id,
            smart_playlist_id,
            limit.unwrap_or(DEFAULT_LIMIT),
        )
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}
