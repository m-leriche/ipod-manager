use serde::Serialize;

/// Identity sent with every outbound API request. MusicBrainz requires a
/// stable, contactable User-Agent; keep this single definition in sync
/// everywhere rather than re-declaring it per module.
pub const USER_AGENT: &str = "Crate/1.0 (https://github.com/m-leriche/ipod-manager)";

#[derive(Debug, Serialize)]
pub struct ServerUrl {
    pub label: String,
    pub url: String,
}

/// Detect network interfaces and build server URLs.
///
/// Parses `ifconfig` output to find non-loopback IPv4 addresses and labels
/// them by network type (Local WiFi, Tailscale, etc.).
///
/// Runs the blocking `ifconfig` call on a background thread to avoid
/// blocking the tokio runtime.
pub async fn detect_server_urls(port: u16) -> Vec<ServerUrl> {
    tokio::task::spawn_blocking(move || detect_server_urls_sync(port))
        .await
        .unwrap_or_default()
}

fn detect_server_urls_sync(port: u16) -> Vec<ServerUrl> {
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
///
/// Tailscale uses the CGNAT range 100.64.0.0/10 (100.64.x.x – 100.127.x.x).
fn classify_ip(ip: &str) -> String {
    if ip.starts_with("100.") {
        if let Some(second) = ip.split('.').nth(1).and_then(|s| s.parse::<u8>().ok()) {
            if (64..=127).contains(&second) {
                return "Tailscale".to_string();
            }
        }
        "Network".to_string()
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
    fn classify_tailscale_cgnat_range() {
        assert_eq!(classify_ip("100.64.0.1"), "Tailscale");
        assert_eq!(classify_ip("100.100.100.100"), "Tailscale");
        assert_eq!(classify_ip("100.127.255.255"), "Tailscale");
    }

    #[test]
    fn classify_non_tailscale_100() {
        assert_eq!(classify_ip("100.0.0.1"), "Network");
        assert_eq!(classify_ip("100.63.255.255"), "Network");
        assert_eq!(classify_ip("100.128.0.1"), "Network");
    }

    #[test]
    fn classify_private_172() {
        assert_eq!(classify_ip("172.16.0.1"), "Local Network");
        assert_eq!(classify_ip("172.31.255.1"), "Local Network");
        assert_eq!(classify_ip("172.15.0.1"), "Network");
        assert_eq!(classify_ip("172.32.0.1"), "Network");
    }
}
