mod download;
mod info;
mod progress;

use serde::{Deserialize, Serialize};
use std::process::Command;

pub use download::download_audio;
pub use info::fetch_video_info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter {
    pub title: String,
    pub start_time: f64,
    pub end_time: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct VideoInfo {
    pub title: String,
    pub duration: String,
    pub uploader: String,
    pub chapters: Vec<Chapter>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub phase: String,
    pub percent: f64,
    pub speed: Option<String>,
    pub eta: Option<String>,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadResult {
    pub success: bool,
    pub cancelled: bool,
    pub file_paths: Vec<String>,
    pub error: Option<String>,
}

// ── Dependency check ─────────────────────────────────────────────

pub fn check_dependencies() -> Result<(), String> {
    let mut missing = Vec::new();

    if Command::new("which")
        .arg("yt-dlp")
        .output()
        .map(|o| !o.status.success())
        .unwrap_or(true)
    {
        missing.push("yt-dlp");
    }
    if Command::new("which")
        .arg("ffmpeg")
        .output()
        .map(|o| !o.status.success())
        .unwrap_or(true)
    {
        missing.push("ffmpeg");
    }

    if missing.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "Missing required tools: {}. Install with: brew install {}",
            missing.join(", "),
            missing.join(" ")
        ))
    }
}

// ── Validation ──────────────────────────────────────────────────

pub(super) fn validate_url(url: &str) -> Result<(), String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("Invalid URL: must start with http:// or https://".to_string());
    }
    // Must have a host after the scheme (reject "https://", "https:///path")
    let after_scheme = url.split("://").nth(1).unwrap_or("");
    let host = after_scheme.split('/').next().unwrap_or("");
    if host.is_empty() || !host.contains('.') {
        return Err("Invalid URL: missing or malformed host".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_url_accepts_valid() {
        assert!(validate_url("https://www.youtube.com/watch?v=abc").is_ok());
        assert!(validate_url("http://example.com/video").is_ok());
        assert!(validate_url("https://soundcloud.com/artist/track").is_ok());
    }

    #[test]
    fn validate_url_rejects_invalid() {
        assert!(validate_url("not-a-url").is_err());
        assert!(validate_url("ftp://files.example.com").is_err());
        assert!(validate_url("https://").is_err());
        assert!(validate_url("https:///path").is_err());
        assert!(validate_url("http://localhost").is_err());
        assert!(validate_url("").is_err());
    }
}
