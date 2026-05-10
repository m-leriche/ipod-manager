use crate::error::AppError;
use crate::library::{self, LibraryDb};
use tauri::State;

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
    db: State<'_, LibraryDb>,
) -> Result<library::export::ImportResult, AppError> {
    db.with_db(move |conn| library::export::import_library(conn, &input_path))
        .await
}
