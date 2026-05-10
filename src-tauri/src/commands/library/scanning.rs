use crate::error::AppError;
use crate::files::SyncCancel;
use crate::library::{self, LibraryDb};
use crate::libstats;
use crate::watcher;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub async fn scan_library_stats(
    path: String,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<libstats::LibraryStats, AppError> {
    let flag = cancel.new_flag();

    tauri::async_runtime::spawn_blocking(move || libstats::scan_library_stats(&path, app, flag))
        .await
        .map_err(|e| format!("Scan failed: {}", e))?
        .map_err(Into::into)
}

#[tauri::command]
pub async fn get_library_stats(
    db: State<'_, LibraryDb>,
) -> Result<libstats::LibraryStats, AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock error: {}", e))?;
        let location = library::get_library_location(&conn).unwrap_or_default();
        libstats::get_library_stats(&conn, &location)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn set_library_location(
    path: String,
    app: AppHandle,
    db: State<'_, LibraryDb>,
    cancel: State<'_, SyncCancel>,
) -> Result<(), AppError> {
    let conn_arc = db.conn_arc();
    let flag = cancel.new_flag();

    {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::set_library_location(&conn, &path)?;
    }

    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::scan_folder(&conn, &path, &app, &flag)
    })
    .await
    .map_err(|e| format!("Scan failed: {}", e))??;

    Ok(())
}

#[tauri::command]
pub async fn import_to_library(
    paths: Vec<String>,
    app: AppHandle,
    db: State<'_, LibraryDb>,
    cancel: State<'_, SyncCancel>,
) -> Result<library::ImportResult, AppError> {
    let conn_arc = db.conn_arc();
    let flag = cancel.new_flag();

    let library_root = {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::get_library_location(&conn).ok_or_else(|| {
            AppError::NotFound("No library location configured. Set one in Settings first.".into())
        })?
    };

    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::import_to_library(&library_root, &paths, &conn, &app, &flag)
    })
    .await
    .map_err(|e| format!("Import failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn add_library_folder(
    path: String,
    app: AppHandle,
    db: State<'_, LibraryDb>,
    cancel: State<'_, SyncCancel>,
) -> Result<(), AppError> {
    let flag = cancel.new_flag();
    let conn_arc = db.conn_arc();

    {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::add_folder(&conn, &path)?;
    }

    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::scan_folder(&conn, &path, &app, &flag)
    })
    .await
    .map_err(|e| format!("Scan failed: {}", e))??;

    Ok(())
}

#[tauri::command]
pub async fn refresh_library(
    app: AppHandle,
    db: State<'_, LibraryDb>,
    cancel: State<'_, SyncCancel>,
) -> Result<(), AppError> {
    let flag = cancel.new_flag();
    let conn_arc = db.conn_arc();

    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::rescan_all_folders(&conn, &app, &flag)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn background_rescan(
    app: AppHandle,
    db: State<'_, LibraryDb>,
    cancel: State<'_, SyncCancel>,
) -> Result<library::BackgroundScanResult, AppError> {
    let flag = cancel.new_flag();
    let conn_arc = db.conn_arc();

    let result = tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::background_rescan_all_folders(&conn, &flag)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    if result.changed > 0 || result.removed > 0 {
        let _ = app.emit(
            "library-changed",
            watcher::LibraryChangeEvent {
                added: result.changed,
                removed: result.removed,
            },
        );
    }

    Ok(result)
}
