use crate::acoustid;
use crate::error::AppError;
use crate::files::SyncCancel;
use crate::library::LibraryDb;
use crate::watcher::FolderWatcher;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn show_in_finder(path: String) -> Result<(), AppError> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open Finder: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn restart_watcher(
    app: AppHandle,
    db: State<'_, LibraryDb>,
    watcher: State<'_, FolderWatcher>,
) -> Result<(), AppError> {
    let db_arc = db.conn_arc();
    crate::watcher::restart_from_db(&watcher, &app, &db_arc).map_err(Into::into)
}

#[tauri::command]
pub async fn check_fpcalc() -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(acoustid::check_fpcalc)
        .await
        .map_err(|e| format!("Check failed: {}", e))?
        .map_err(Into::into)
}

#[tauri::command]
pub async fn identify_tracks(
    file_paths: Vec<String>,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<Vec<acoustid::IdentifyResult>, AppError> {
    let flag = cancel.new_flag();

    tauri::async_runtime::spawn_blocking(move || acoustid::identify_tracks(file_paths, app, flag))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
        .map_err(Into::into)
}
