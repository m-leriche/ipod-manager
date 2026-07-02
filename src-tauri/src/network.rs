use serde::Serialize;
use std::time::Duration;

/// Identity sent with every outbound API request. MusicBrainz requires a
/// stable, contactable User-Agent; keep this single definition in sync
/// everywhere rather than re-declaring it per module.
pub const USER_AGENT: &str = "Crate/1.0 (https://github.com/m-leriche/ipod-manager)";

const MAX_ATTEMPTS: u32 = 3;
const BACKOFF_MS: [u64; 2] = [500, 1500];
const RETRY_AFTER_CAP_SECS: u64 = 10;

/// A failed fetch attempt, classified for retry decisions.
#[derive(Debug)]
pub enum FetchError {
    /// Connection/transport failure — retryable.
    Transport(String),
    /// HTTP error status — retryable only for 429 and 5xx.
    Status {
        code: u16,
        retry_after_secs: Option<u64>,
    },
}

impl From<ureq::Error> for FetchError {
    fn from(err: ureq::Error) -> Self {
        match err {
            ureq::Error::Status(code, resp) => FetchError::Status {
                code,
                retry_after_secs: resp.header("Retry-After").and_then(|v| v.parse().ok()),
            },
            ureq::Error::Transport(t) => FetchError::Transport(t.to_string()),
        }
    }
}

impl std::fmt::Display for FetchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FetchError::Transport(msg) => write!(f, "{}", msg),
            FetchError::Status { code, .. } => write!(f, "HTTP status {}", code),
        }
    }
}

impl FetchError {
    fn is_retryable(&self) -> bool {
        match self {
            FetchError::Transport(_) => true,
            FetchError::Status { code, .. } => *code == 429 || (500..=599).contains(code),
        }
    }

    /// Delay before the next attempt: honor a numeric Retry-After on 429
    /// (capped), otherwise exponential backoff with jitter.
    fn retry_delay(&self, attempt: u32) -> Duration {
        if let FetchError::Status {
            code: 429,
            retry_after_secs: Some(secs),
        } = self
        {
            return Duration::from_secs((*secs).min(RETRY_AFTER_CAP_SECS));
        }
        let base = BACKOFF_MS[(attempt as usize - 1).min(BACKOFF_MS.len() - 1)];
        Duration::from_millis(base + fastrand::u64(0..=base / 4))
    }
}

/// Run a fetch operation with up to 3 attempts, backing off ~500ms then
/// ~1500ms (with jitter) between attempts. Retries only transport errors
/// and HTTP 429/5xx; other statuses fail immediately.
pub fn fetch_with_retry<T>(op: impl FnMut() -> Result<T, FetchError>) -> Result<T, FetchError> {
    fetch_with_retry_impl(op, std::thread::sleep)
}

fn fetch_with_retry_impl<T>(
    mut op: impl FnMut() -> Result<T, FetchError>,
    sleep: impl Fn(Duration),
) -> Result<T, FetchError> {
    for attempt in 1..MAX_ATTEMPTS {
        match op() {
            Ok(value) => return Ok(value),
            Err(err) if err.is_retryable() => sleep(err.retry_delay(attempt)),
            Err(err) => return Err(err),
        }
    }
    op()
}

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
    use std::cell::RefCell;

    fn transport() -> FetchError {
        FetchError::Transport("connection reset".into())
    }

    fn status(code: u16) -> FetchError {
        FetchError::Status {
            code,
            retry_after_secs: None,
        }
    }

    fn run_retry<T>(
        op: impl FnMut() -> Result<T, FetchError>,
    ) -> (Result<T, FetchError>, Vec<Duration>) {
        let sleeps = RefCell::new(Vec::new());
        let result = fetch_with_retry_impl(op, |d| sleeps.borrow_mut().push(d));
        (result, sleeps.into_inner())
    }

    #[test]
    fn succeeds_first_attempt_without_sleeping() {
        let mut attempts = 0;
        let (result, sleeps) = run_retry(|| {
            attempts += 1;
            Ok::<_, FetchError>(42)
        });
        assert_eq!(result.ok(), Some(42));
        assert_eq!(attempts, 1);
        assert!(sleeps.is_empty());
    }

    #[test]
    fn retries_transport_error_then_succeeds() {
        let mut attempts = 0;
        let (result, sleeps) = run_retry(|| {
            attempts += 1;
            if attempts < 2 {
                Err(transport())
            } else {
                Ok(7)
            }
        });
        assert_eq!(result.ok(), Some(7));
        assert_eq!(attempts, 2);
        assert_eq!(sleeps.len(), 1);
    }

    #[test]
    fn gives_up_after_three_attempts() {
        let mut attempts = 0;
        let (result, sleeps) = run_retry(|| -> Result<(), FetchError> {
            attempts += 1;
            Err(status(503))
        });
        assert!(result.is_err());
        assert_eq!(attempts, 3);
        assert_eq!(sleeps.len(), 2);
    }

    #[test]
    fn does_not_retry_client_errors() {
        for code in [400, 401, 403, 404] {
            let mut attempts = 0;
            let (result, sleeps) = run_retry(|| -> Result<(), FetchError> {
                attempts += 1;
                Err(status(code))
            });
            assert!(result.is_err());
            assert_eq!(attempts, 1, "HTTP {} should not be retried", code);
            assert!(sleeps.is_empty());
        }
    }

    #[test]
    fn retryable_classification() {
        assert!(transport().is_retryable());
        assert!(status(429).is_retryable());
        assert!(status(500).is_retryable());
        assert!(status(599).is_retryable());
        assert!(!status(404).is_retryable());
        assert!(!status(418).is_retryable());
    }

    #[test]
    fn backoff_delays_grow_with_jitter() {
        let first = transport().retry_delay(1).as_millis() as u64;
        let second = transport().retry_delay(2).as_millis() as u64;
        assert!((500..=625).contains(&first), "first delay was {}", first);
        assert!(
            (1500..=1875).contains(&second),
            "second delay was {}",
            second
        );
    }

    #[test]
    fn honors_retry_after_on_429_with_cap() {
        let err = FetchError::Status {
            code: 429,
            retry_after_secs: Some(3),
        };
        assert_eq!(err.retry_delay(1), Duration::from_secs(3));

        let capped = FetchError::Status {
            code: 429,
            retry_after_secs: Some(120),
        };
        assert_eq!(
            capped.retry_delay(1),
            Duration::from_secs(RETRY_AFTER_CAP_SECS)
        );
    }

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
