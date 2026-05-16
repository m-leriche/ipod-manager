use crate::error::AppError;
use crate::library::LibraryDb;
use crate::network::ServerUrl;
use crate::subsonic::SubsonicServer;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct SubsonicStatus {
    pub enabled: bool,
    pub port: u16,
    pub username: String,
    pub urls: Vec<ServerUrl>,
}

/// Returns the current Subsonic server status including reachable URLs.
///
/// Detects local network interfaces and returns URLs for each:
/// - Local WiFi (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
/// - Tailscale VPN (100.64-127.x.x) — for remote access outside home network
#[tauri::command]
pub async fn get_subsonic_status(
    db: State<'_, LibraryDb>,
    server: State<'_, SubsonicServer>,
) -> Result<SubsonicStatus, AppError> {
    let (username, port) = {
        let conn = db.lock_conn()?;
        let username = crate::library::get_setting(&conn, "subsonic_username")
            .unwrap_or_else(|| "admin".to_string());
        (username, server.port)
    };

    let urls = crate::network::detect_server_urls(port).await;

    Ok(SubsonicStatus {
        enabled: true,
        port,
        username,
        urls,
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
