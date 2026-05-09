use crate::albumart;
use crate::error::AppError;
use crate::files::{ArtRepairCancel, SyncCancel};
use crate::library::{self, LibraryDb};
use crate::metadata;
use crate::metarepair;
use crate::sanitize;
use rusqlite::params;
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager, State};

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

    let result = tauri::async_runtime::spawn_blocking(move || {
        albumart::fix_album_art(folders, app, flag, "albumart-progress")
    })
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

#[tauri::command]
pub async fn fix_library_album_art(
    app: AppHandle,
    db: State<'_, LibraryDb>,
    cancel: State<'_, ArtRepairCancel>,
) -> Result<albumart::AlbumArtResult, AppError> {
    let flag = cancel.new_flag();
    let conn_arc = db.conn_arc();

    let result = tauri::async_runtime::spawn_blocking(move || -> Result<_, AppError> {
        // Lock briefly to query folders, then release before the long-running repair
        let folders = {
            let conn = conn_arc
                .lock()
                .map_err(|e| format!("DB lock failed: {}", e))?;

            let mut stmt = conn
                .prepare("SELECT DISTINCT folder_path FROM tracks")
                .map_err(|e| format!("Query failed: {}", e))?;

            let folders: Vec<String> = stmt
                .query_map(params![], |row| row.get(0))
                .map_err(|e| format!("Query failed: {}", e))?
                .filter_map(|r| r.ok())
                .filter(|path: &String| !albumart::has_cover(Path::new(path)))
                .collect();

            folders
        }; // lock released here

        if folders.is_empty() {
            return Ok(albumart::AlbumArtResult {
                total: 0,
                fixed: 0,
                already_ok: 0,
                failed: 0,
                cancelled: false,
                errors: Vec::new(),
            });
        }

        Ok(albumart::fix_album_art(
            folders,
            app,
            flag,
            "library-art-repair-progress",
        ))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    Ok(result)
}

#[tauri::command]
pub async fn upload_album_art(
    folder_path: String,
    image_path: String,
    app: AppHandle,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || -> Result<(), AppError> {
        albumart::save_uploaded_cover(&folder_path, &image_path)?;
        // Invalidate cached thumbnails so they regenerate from the new art
        if let Ok(cache_dir) = app.path().app_data_dir().map(|d| d.join("thumbnails")) {
            crate::thumbnail::invalidate(&cache_dir, &folder_path);
        }
        let _ = app.emit("album-art-fixed", folder_path);
        Ok(())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub fn cancel_art_repair(cancel: State<'_, ArtRepairCancel>) -> Result<(), AppError> {
    cancel.cancel();
    Ok(())
}

// ── Thumbnail cache ────────────────────────────────────────────

#[tauri::command]
pub async fn get_thumbnail(
    folder_path: String,
    size: String,
    app: AppHandle,
) -> Result<Option<String>, AppError> {
    let cache_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?
        .join("thumbnails");

    let thumb_size = crate::thumbnail::ThumbSize::parse(&size)
        .ok_or_else(|| AppError::InvalidInput(format!("Invalid thumbnail size: {size}")))?;

    let result = tauri::async_runtime::spawn_blocking(move || {
        crate::thumbnail::get_or_create(&cache_dir, &folder_path, thumb_size)
            .map(|p| p.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;

    Ok(result)
}

#[tauri::command]
pub async fn invalidate_thumbnail(folder_path: String, app: AppHandle) -> Result<(), AppError> {
    let cache_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?
        .join("thumbnails");

    crate::thumbnail::invalidate(&cache_dir, &folder_path);
    Ok(())
}
