use crate::error::AppError;
use crate::files::SyncCancel;
use crate::library::{self, LibraryDb};
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn get_library_tracks(
    filter: library::LibraryFilter,
    db: State<'_, LibraryDb>,
) -> Result<Vec<library::LibraryTrack>, AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::get_tracks(&conn, &filter)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn get_library_browser_data(
    filter: library::LibraryFilter,
    db: State<'_, LibraryDb>,
) -> Result<library::BrowserData, AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::get_browser_data(&conn, &filter)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn get_library_browser_data_paginated(
    filter: library::LibraryFilter,
    db: State<'_, LibraryDb>,
) -> Result<library::PaginatedBrowserData, AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::get_browser_data_paginated(&conn, &filter)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn get_library_tracks_page(
    filter: library::LibraryFilter,
    db: State<'_, LibraryDb>,
) -> Result<library::PaginatedTracks, AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::get_tracks_paginated(&conn, &filter)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn get_library_artists(
    db: State<'_, LibraryDb>,
) -> Result<Vec<library::ArtistSummary>, AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::get_artists(&conn)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn get_library_albums(
    artist: Option<String>,
    db: State<'_, LibraryDb>,
) -> Result<Vec<library::AlbumSummary>, AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::get_albums(&conn, artist.as_deref())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn get_library_genres(
    db: State<'_, LibraryDb>,
) -> Result<Vec<library::GenreSummary>, AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::get_genres(&conn)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn search_library(
    query: String,
    db: State<'_, LibraryDb>,
) -> Result<Vec<library::LibraryTrack>, AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::search_tracks(&conn, &query)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn detect_duplicates(
    app: AppHandle,
    db: State<'_, LibraryDb>,
    cancel: State<'_, SyncCancel>,
) -> Result<library::duplicates::DuplicateDetectionResult, AppError> {
    let flag = cancel.new_flag();
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::duplicates::detect_duplicates(&conn, &app, &flag)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn delete_duplicate_tracks(
    track_ids: Vec<i64>,
    db: State<'_, LibraryDb>,
) -> Result<usize, AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        let library_root = library::get_library_location(&conn)
            .ok_or_else(|| "No library location set".to_string())?;
        library::delete_tracks(&conn, &library_root, &track_ids)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}
