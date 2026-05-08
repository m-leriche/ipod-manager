use crate::error::AppError;
use crate::library::{self, LibraryDb};
use tauri::State;

#[tauri::command]
pub async fn get_library_health(
    db: State<'_, LibraryDb>,
) -> Result<library::health::HealthReport, AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock error: {}", e))?;
        library::health::get_library_health(&conn)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn get_health_issue_tracks(
    issue_id: String,
    db: State<'_, LibraryDb>,
) -> Result<Vec<library::LibraryTrack>, AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock error: {}", e))?;
        library::health::get_health_issue_tracks(&conn, &issue_id)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn export_library(
    output_path: String,
    db: State<'_, LibraryDb>,
) -> Result<library::export::ExportResult, AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock error: {}", e))?;
        library::export::export_library(&conn, &output_path)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}
