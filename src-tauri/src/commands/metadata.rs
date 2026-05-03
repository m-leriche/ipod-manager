use crate::albumart;
use crate::error::AppError;
use crate::files::SyncCancel;
use crate::library::{self, LibraryDb};
use crate::metadata;
use crate::metarepair;
use crate::sanitize;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub async fn scan_album_art(
    path: String,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<Vec<albumart::AlbumInfo>, AppError> {
    let flag = cancel.new_flag();

    tauri::async_runtime::spawn_blocking(move || albumart::scan_albums(&path, app, flag))
        .await
        .map_err(|e| format!("Scan failed: {}", e))?
        .map_err(Into::into)
}

#[tauri::command]
pub async fn fix_album_art(
    folders: Vec<String>,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<albumart::AlbumArtResult, AppError> {
    let flag = cancel.new_flag();

    let result =
        tauri::async_runtime::spawn_blocking(move || albumart::fix_album_art(folders, app, flag))
            .await
            .map_err(|e| format!("Task failed: {}", e))?;

    Ok(result)
}

#[tauri::command]
pub async fn scan_metadata_paths(
    paths: Vec<String>,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<Vec<metadata::TrackMetadata>, AppError> {
    let flag = cancel.new_flag();

    tauri::async_runtime::spawn_blocking(move || metadata::scan_metadata_paths(paths, app, flag))
        .await
        .map_err(|e| format!("Scan failed: {}", e))?
        .map_err(Into::into)
}

#[tauri::command]
pub async fn scan_metadata(
    path: String,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<Vec<metadata::TrackMetadata>, AppError> {
    let flag = cancel.new_flag();

    tauri::async_runtime::spawn_blocking(move || metadata::scan_metadata(&path, app, flag))
        .await
        .map_err(|e| format!("Scan failed: {}", e))?
        .map_err(Into::into)
}

#[tauri::command]
pub async fn save_metadata(
    updates: Vec<metadata::MetadataUpdate>,
    app: AppHandle,
    db: State<'_, LibraryDb>,
    cancel: State<'_, SyncCancel>,
) -> Result<metadata::MetadataSaveResult, AppError> {
    let flag = cancel.new_flag();
    let conn_arc = db.conn_arc();
    let app_clone = app.clone();

    let file_paths: Vec<String> = updates.iter().map(|u| u.file_path.clone()).collect();

    let result = tauri::async_runtime::spawn_blocking(move || {
        Ok::<_, AppError>(metadata::save_metadata(updates, app, flag))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    // Re-scan metadata into DB and reorganize files in the managed library
    let conn = conn_arc
        .lock()
        .map_err(|e| format!("DB lock failed: {}", e))?;
    if let Some(library_root) = library::get_library_location(&conn) {
        let mut updated = 0usize;
        for file_path in &file_paths {
            if file_path.starts_with(&library_root)
                && library::reorganize_library_file(&conn, &library_root, file_path).is_ok()
            {
                updated += 1;
            }
        }
        if updated > 0 {
            let _ = app_clone.emit("library-files-reorganized", updated);
        }
    }

    Ok(result)
}

#[tauri::command]
pub async fn repair_analyze(
    tracks: Vec<metadata::TrackMetadata>,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<metarepair::RepairReport, AppError> {
    let flag = cancel.new_flag();

    tauri::async_runtime::spawn_blocking(move || metarepair::lookup_and_compare(tracks, app, flag))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
        .map_err(Into::into)
}

#[tauri::command]
pub async fn repair_compare_release(
    tracks: Vec<metadata::TrackMetadata>,
    mbid: String,
    app: AppHandle,
) -> Result<metarepair::AlbumRepairReport, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let _ = &app;
        metarepair::compare_against_release(tracks, &mbid)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn sanitize_tags(
    options: sanitize::SanitizeOptions,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<sanitize::SanitizeResult, AppError> {
    let flag = cancel.new_flag();

    let result =
        tauri::async_runtime::spawn_blocking(move || sanitize::sanitize_tags(options, app, flag))
            .await
            .map_err(|e| format!("Task failed: {}", e))?;

    Ok(result)
}
