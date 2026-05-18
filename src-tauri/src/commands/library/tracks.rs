use crate::error::AppError;
use crate::library::{self, LibraryDb};
use crate::subsonic::SubsonicCacheHandle;
use tauri::State;

#[tauri::command]
pub async fn delete_library_tracks(
    track_ids: Vec<i64>,
    db: State<'_, LibraryDb>,
    cache: State<'_, SubsonicCacheHandle>,
) -> Result<usize, AppError> {
    let result = db
        .with_db(move |conn| {
            let library_root = library::get_library_location(conn)
                .ok_or_else(|| "No library location set".to_string())?;
            library::delete_tracks(conn, &library_root, &track_ids)
        })
        .await?;
    cache.invalidate();
    Ok(result)
}

#[tauri::command]
pub async fn flag_tracks(
    track_ids: Vec<i64>,
    flagged: bool,
    db: State<'_, LibraryDb>,
) -> Result<usize, AppError> {
    if track_ids.is_empty() {
        return Ok(0);
    }
    db.with_db(move |conn| {
        let placeholders: Vec<String> = (0..track_ids.len())
            .map(|i| format!("?{}", i + 2))
            .collect();
        let sql = format!(
            "UPDATE tracks SET flagged = ?1 WHERE id IN ({})",
            placeholders.join(", ")
        );
        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(flagged)];
        for id in &track_ids {
            params.push(Box::new(*id));
        }
        let refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, refs.as_slice())
            .map_err(|e| format!("Flag update failed: {}", e))
    })
    .await
}

#[tauri::command]
pub async fn rate_tracks(
    track_ids: Vec<i64>,
    rating: u8,
    db: State<'_, LibraryDb>,
) -> Result<usize, AppError> {
    if track_ids.is_empty() {
        return Ok(0);
    }
    if rating > 5 {
        return Err(AppError::InvalidInput("Rating must be 0-5".into()));
    }
    db.with_db(move |conn| {
        let placeholders: Vec<String> = (0..track_ids.len())
            .map(|i| format!("?{}", i + 2))
            .collect();
        let sql = format!(
            "UPDATE tracks SET rating = ?1 WHERE id IN ({})",
            placeholders.join(", ")
        );
        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(rating as i64)];
        for id in &track_ids {
            params.push(Box::new(*id));
        }
        let refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, refs.as_slice())
            .map_err(|e| format!("Rating update failed: {}", e))
    })
    .await
}

#[tauri::command]
pub async fn increment_play_count(track_id: i64, db: State<'_, LibraryDb>) -> Result<(), AppError> {
    db.with_db(move |conn| {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        conn.execute(
            "UPDATE tracks SET play_count = play_count + 1, last_played = ?1 WHERE id = ?2",
            rusqlite::params![now, track_id],
        )
        .map_err(|e| format!("Play count update failed: {}", e))?;
        Ok::<_, String>(())
    })
    .await
}
