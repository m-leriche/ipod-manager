use crate::error::AppError;
use crate::library::{self, LibraryDb};
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub async fn backup_library(
    db: State<'_, LibraryDb>,
    app: AppHandle,
) -> Result<library::backup::BackupInfo, AppError> {
    let db_path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?
        .join("library.db");

    db.with_db(move |conn| library::backup::create_backup(conn, &db_path))
        .await
}

#[tauri::command]
pub async fn list_library_backups(
    app: AppHandle,
) -> Result<Vec<library::backup::BackupInfo>, AppError> {
    let db_path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?
        .join("library.db");

    Ok(library::backup::list_backups(&db_path)?)
}

#[tauri::command]
pub async fn restore_library_backup(
    backup_path: String,
    app: AppHandle,
) -> Result<library::backup::RestoreResult, AppError> {
    let db_path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?
        .join("library.db");

    Ok(library::backup::restore_backup(&db_path, &backup_path)?)
}
