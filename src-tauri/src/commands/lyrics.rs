use crate::error::AppError;
use crate::library::LibraryDb;
use crate::lyrics;
use tauri::State;

#[tauri::command]
pub async fn get_lyrics(
    track_id: i64,
    db: State<'_, LibraryDb>,
) -> Result<lyrics::TrackLyrics, AppError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("DB lock failed: {}", e))?;

    lyrics::get_lyrics(&conn, track_id).map_err(Into::into)
}

#[tauri::command]
pub async fn fetch_lyrics(
    track_id: i64,
    artist: String,
    title: String,
    album: Option<String>,
    duration_secs: Option<f64>,
    db: State<'_, LibraryDb>,
) -> Result<lyrics::TrackLyrics, AppError> {
    let conn_arc = db.conn_arc();

    tauri::async_runtime::spawn_blocking(move || -> Result<lyrics::TrackLyrics, AppError> {
        let result = lyrics::fetch_lyrics(&artist, &title, album.as_deref(), duration_secs)?;

        // Save to database
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;

        lyrics::save_lyrics(
            &conn,
            track_id,
            result.plain_lyrics.as_deref(),
            result.synced_lyrics.as_deref(),
        )?;

        Ok(lyrics::TrackLyrics {
            track_id,
            lyrics: result.plain_lyrics,
            synced_lyrics: result.synced_lyrics,
            source: result.source,
        })
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn save_lyrics(
    track_id: i64,
    plain_lyrics: Option<String>,
    synced_lyrics: Option<String>,
    db: State<'_, LibraryDb>,
) -> Result<(), AppError> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("DB lock failed: {}", e))?;

    lyrics::save_lyrics(
        &conn,
        track_id,
        plain_lyrics.as_deref(),
        synced_lyrics.as_deref(),
    )
    .map_err(Into::into)
}

#[tauri::command]
pub async fn write_lyrics_to_file(file_path: String, plain_lyrics: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        lyrics::write_lyrics_to_file(&file_path, &plain_lyrics)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}
