use crate::error::AppError;
use crate::library::{self, LibraryDb};
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub async fn get_library_health(
    db: State<'_, LibraryDb>,
) -> Result<library::health::HealthReport, AppError> {
    db.with_db(library::health::get_library_health).await
}

#[tauri::command]
pub async fn get_health_issue_tracks(
    issue_id: String,
    db: State<'_, LibraryDb>,
) -> Result<Vec<library::LibraryTrack>, AppError> {
    db.with_db(move |conn| library::health::get_health_issue_tracks(conn, &issue_id))
        .await
}

#[tauri::command]
pub async fn export_library(
    output_path: String,
    db: State<'_, LibraryDb>,
) -> Result<library::export::ExportResult, AppError> {
    db.with_db(move |conn| library::export::export_library(conn, &output_path))
        .await
}

#[tauri::command]
pub async fn import_library(
    input_path: String,
    app: AppHandle,
    db: State<'_, LibraryDb>,
) -> Result<library::export::ImportResult, AppError> {
    // Auto-backup before importing (can overwrite library data)
    if let Ok(data_dir) = app.path().app_data_dir() {
        let db_path = data_dir.join("library.db");
        let conn_arc = db.conn_arc();
        let _ = tauri::async_runtime::spawn_blocking(move || {
            if let Ok(conn) = conn_arc.lock() {
                library::backup::auto_backup_if_due(&conn, &db_path);
            }
        })
        .await;
    }
    db.with_db(move |conn| library::export::import_library(conn, &input_path))
        .await
}
