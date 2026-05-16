use crate::error::AppError;
use crate::library::LibraryDb;
use crate::subsonic::SubsonicServer;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct ServerUrl {
    pub label: String,
    pub url: String,
}

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
/// - Tailscale VPN (100.x.x.x) — for remote access outside home network
#[tauri::command]
pub async fn get_subsonic_status(
    db: State<'_, LibraryDb>,
    server: State<'_, SubsonicServer>,
) -> Result<SubsonicStatus, AppError> {
    let conn = db.lock_conn()?;
    let username = crate::library::get_setting(&conn, "subsonic_username")
        .unwrap_or_else(|| "admin".to_string());

    let port = server.port;
    let urls = detect_server_urls(port);

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

/// Detect network interfaces and build server URLs.
///
/// Parses `ifconfig` output to find non-loopback IPv4 addresses and labels
/// them by network type (Local WiFi, Tailscale, etc.).
fn detect_server_urls(port: u16) -> Vec<ServerUrl> {
    let output = match std::process::Command::new("ifconfig").output() {
        Ok(o) => o,
        Err(_) => return vec![],
    };
    let text = String::from_utf8_lossy(&output.stdout);

    let mut urls = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if !line.starts_with("inet ") {
            continue;
        }
        // Format: "inet 192.168.2.176 netmask ..."
        let ip = match line.split_whitespace().nth(1) {
            Some(ip) => ip,
            None => continue,
        };
        if ip == "127.0.0.1" {
            continue;
        }
        let label = classify_ip(ip);
        urls.push(ServerUrl {
            label,
            url: format!("http://{ip}:{port}"),
        });
    }
    urls
}

/// Classify an IP address by its network range.
fn classify_ip(ip: &str) -> String {
    if ip.starts_with("100.") {
        "Tailscale".to_string()
    } else if ip.starts_with("192.168.") || ip.starts_with("10.") {
        "Local WiFi".to_string()
    } else if ip.starts_with("172.") {
        // 172.16.0.0 – 172.31.255.255
        if let Some(second) = ip.split('.').nth(1).and_then(|s| s.parse::<u8>().ok()) {
            if (16..=31).contains(&second) {
                return "Local Network".to_string();
            }
        }
        "Network".to_string()
    } else {
        "Network".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_local_wifi() {
        assert_eq!(classify_ip("192.168.1.100"), "Local WiFi");
        assert_eq!(classify_ip("10.0.0.1"), "Local WiFi");
    }

    #[test]
    fn classify_tailscale() {
        assert_eq!(classify_ip("100.64.0.1"), "Tailscale");
        assert_eq!(classify_ip("100.100.100.100"), "Tailscale");
    }

    #[test]
    fn classify_private_172() {
        assert_eq!(classify_ip("172.16.0.1"), "Local Network");
        assert_eq!(classify_ip("172.31.255.1"), "Local Network");
        assert_eq!(classify_ip("172.15.0.1"), "Network");
        assert_eq!(classify_ip("172.32.0.1"), "Network");
    }
}
