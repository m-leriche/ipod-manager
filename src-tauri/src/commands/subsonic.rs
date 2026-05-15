use crate::error::AppError;
use crate::library::LibraryDb;
use crate::subsonic::SubsonicServer;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct SubsonicStatus {
    pub enabled: bool,
    pub port: u16,
    pub username: String,
}

/// Returns the current Subsonic server status.
///
/// Note: `enabled` is always `true` — the server starts with the app and
/// cannot be toggled at runtime yet.
#[tauri::command]
pub async fn get_subsonic_status(
    db: State<'_, LibraryDb>,
    server: State<'_, SubsonicServer>,
) -> Result<SubsonicStatus, AppError> {
    let conn = db.lock_conn()?;
    let username = crate::library::get_setting(&conn, "subsonic_username")
        .unwrap_or_else(|| "admin".to_string());

    Ok(SubsonicStatus {
        enabled: true,
        port: server.port,
        username,
    })
}

#[tauri::command]
pub async fn set_subsonic_credentials(
    db: State<'_, LibraryDb>,
    username: String,
    password: String,
) -> Result<(), AppError> {
    let conn = db.lock_conn()?;
    crate::library::set_setting(&conn, "subsonic_username", &username)?;
    crate::library::set_setting(&conn, "subsonic_password", &password)?;
    Ok(())
}

/// Save a new port for the Subsonic server. Takes effect on next app restart.
#[tauri::command]
pub async fn set_subsonic_port(db: State<'_, LibraryDb>, port: u16) -> Result<(), AppError> {
    let conn = db.lock_conn()?;
    crate::library::set_setting(&conn, "subsonic_port", &port.to_string())?;
    Ok(())
}
