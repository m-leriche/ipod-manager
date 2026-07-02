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
    db: State<'_, LibraryDb>,
) -> Result<library::backup::RestoreResult, AppError> {
    let db_path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?
        .join("library.db");
    let conn_arc = db.conn_arc();

    tauri::async_runtime::spawn_blocking(move || -> Result<_, String> {
        // Hold the writer lock for the whole swap so no other command can
        // touch the stale connection mid-restore.
        let mut guard = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {e}"))?;

        // Close the live connection BEFORE overwriting its file: its page
        // cache and WAL state belong to the old database, and the exit-time
        // wal_checkpoint would otherwise replay pre-restore frames into the
        // just-restored file, corrupting or silently undoing the restore.
        let placeholder = rusqlite::Connection::open_in_memory()
            .map_err(|e| format!("Failed to open placeholder connection: {e}"))?;
        drop(std::mem::replace(&mut *guard, placeholder));

        let result = library::backup::restore_backup(&db_path, &backup_path)?;

        // Reopen on the restored file so everything until the relaunch —
        // including the exit checkpoint — operates on the new database.
        *guard = library::init_db(&db_path)
            .map_err(|e| format!("Restored database failed to open: {e}"))?;
        Ok(result)
    })
    .await
    .map_err(|e| format!("Restore task failed: {e}"))?
    .map_err(AppError::Generic)
}
