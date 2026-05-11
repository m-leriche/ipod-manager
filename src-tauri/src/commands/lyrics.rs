use crate::error::AppError;
use crate::files::LyricsCancel;
use crate::library::LibraryDb;
use crate::lyrics;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn get_lyrics(
    track_id: i64,
    db: State<'_, LibraryDb>,
) -> Result<lyrics::TrackLyrics, AppError> {
    let conn = db.lock_conn()?;
    lyrics::get_lyrics(&conn, track_id).map_err(Into::into)
}

#[tauri::command]
pub async fn fetch_lyrics(
    track_id: i64,
    artist: String,
    title: String,
    album: Option<String>,
    duration_secs: Option<f64>,
    file_path: String,
    db: State<'_, LibraryDb>,
) -> Result<lyrics::TrackLyrics, AppError> {
    let conn_arc = db.conn_arc();

    tauri::async_runtime::spawn_blocking(move || -> Result<lyrics::TrackLyrics, AppError> {
        let result = lyrics::fetch_lyrics(&artist, &title, album.as_deref(), duration_secs)?;

        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;

        lyrics::save_lyrics(
            &conn,
            track_id,
            result.plain_lyrics.as_deref(),
            result.synced_lyrics.as_deref(),
        )?;

        if let Some(ref plain) = result.plain_lyrics {
            let _ = lyrics::write_lyrics_to_file(&file_path, plain);
        }

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
pub async fn remove_lyrics(
    track_id: i64,
    file_path: String,
    db: State<'_, LibraryDb>,
) -> Result<(), AppError> {
    db.with_db(move |conn| lyrics::remove_lyrics(conn, track_id, &file_path))
        .await
}

#[tauri::command]
pub async fn save_lyrics(
    track_id: i64,
    plain_lyrics: Option<String>,
    synced_lyrics: Option<String>,
    db: State<'_, LibraryDb>,
) -> Result<(), AppError> {
    let conn = db.lock_conn()?;
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

#[tauri::command]
pub async fn fetch_library_lyrics(
    app: AppHandle,
    db: State<'_, LibraryDb>,
    cancel: State<'_, LyricsCancel>,
) -> Result<lyrics::LyricsFetchResult, AppError> {
    let flag = cancel.new_flag();
    let conn_arc = db.conn_arc();

    tauri::async_runtime::spawn_blocking(move || -> Result<lyrics::LyricsFetchResult, AppError> {
        Ok(lyrics::fetch_library_lyrics(&conn_arc, &app, &flag))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub fn cancel_lyrics_fetch(cancel: State<'_, LyricsCancel>) -> Result<(), AppError> {
    cancel.cancel();
    Ok(())
}

#[tauri::command]
pub async fn reset_lyrics_not_found(db: State<'_, LibraryDb>) -> Result<usize, AppError> {
    let conn = db.lock_conn()?;
    lyrics::reset_lyrics_not_found(&conn).map_err(Into::into)
}

#[tauri::command]
pub async fn count_lyrics_not_found(db: State<'_, LibraryDb>) -> Result<usize, AppError> {
    let conn = db.lock_conn()?;
    Ok(lyrics::count_lyrics_not_found(&conn))
}
