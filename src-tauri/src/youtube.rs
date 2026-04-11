use serde::Serialize;
use std::io::BufRead;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
pub struct VideoInfo {
    pub title: String,
    pub duration: String,
    pub uploader: String,
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
    pub file_path: Option<String>,
    pub error: Option<String>,
}

// ── Dependency check ─────────────────────────────────────────────

pub fn check_dependencies() -> Result<(), String> {
    let mut missing = Vec::new();

    if Command::new("which").arg("yt-dlp").output().map(|o| !o.status.success()).unwrap_or(true) {
        missing.push("yt-dlp");
    }
    if Command::new("which").arg("ffmpeg").output().map(|o| !o.status.success()).unwrap_or(true) {
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

// ── Video info ───────────────────────────────────────────────────

pub fn fetch_video_info(url: &str) -> Result<VideoInfo, String> {
    if !url.starts_with("http") {
        return Err("Invalid URL".to_string());
    }

    let output = Command::new("yt-dlp")
        .args(["--dump-json", "--no-download", url])
        .output()
        .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp error: {}", stderr.trim()));
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse video info: {}", e))?;

    let title = json["title"]
        .as_str()
        .unwrap_or("Unknown title")
        .to_string();

    let duration_secs = json["duration"].as_f64().unwrap_or(0.0) as u64;
    let mins = duration_secs / 60;
    let secs = duration_secs % 60;
    let duration = format!("{}:{:02}", mins, secs);

    let uploader = json["uploader"]
        .as_str()
        .or_else(|| json["channel"].as_str())
        .unwrap_or("Unknown")
        .to_string();

    Ok(VideoInfo {
        title,
        duration,
        uploader,
    })
}

// ── Download ─────────────────────────────────────────────────────

pub fn download_audio(
    url: &str,
    output_dir: &str,
    format: &str,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
) -> DownloadResult {
    if format != "flac" && format != "mp3" {
        return DownloadResult {
            success: false,
            cancelled: false,
            file_path: None,
            error: Some(format!("Invalid format: {}", format)),
        };
    }

    let output_template = format!("{}/%(title)s.%(ext)s", output_dir);

    let mut args = vec![
        "-x".to_string(),
        "--audio-format".to_string(),
        format.to_string(),
    ];

    if format == "flac" {
        args.push("--postprocessor-args".to_string());
        args.push("ffmpeg:-ar 44100 -sample_fmt s16".to_string());
    } else {
        args.push("--audio-quality".to_string());
        args.push("0".to_string());
    }

    args.extend([
        "-o".to_string(),
        output_template,
        "--newline".to_string(),
        "--no-mtime".to_string(),
        url.to_string(),
    ]);

    let mut child = match Command::new("yt-dlp")
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            return DownloadResult {
                success: false,
                cancelled: false,
                file_path: None,
                error: Some(format!("Failed to start yt-dlp: {}", e)),
            };
        }
    };

    let stdout = child.stdout.take().expect("stdout piped");
    let reader = std::io::BufReader::new(stdout);
    let mut file_path: Option<String> = None;

    for line in reader.lines() {
        if cancel_flag.load(Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            return DownloadResult {
                success: false,
                cancelled: true,
                file_path: None,
                error: None,
            };
        }

        let Ok(line) = line else { continue };

        // Capture destination path
        if line.contains("[download] Destination:") {
            if let Some(path) = line.split("Destination:").nth(1) {
                file_path = Some(path.trim().to_string());
            }
        }

        // Capture final merged/converted path
        if line.contains("[ExtractAudio]") || line.contains("[ffmpeg]") {
            let _ = app.emit(
                "youtube-progress",
                DownloadProgress {
                    phase: "converting".to_string(),
                    percent: 100.0,
                    speed: None,
                    eta: None,
                    title: None,
                },
            );

            // Try to extract output path from lines like:
            // [ExtractAudio] Destination: /path/to/file.flac
            if line.contains("Destination:") {
                if let Some(path) = line.split("Destination:").nth(1) {
                    file_path = Some(path.trim().to_string());
                }
            }
            continue;
        }

        if let Some(progress) = parse_progress_line(&line) {
            let _ = app.emit("youtube-progress", progress);
        }
    }

    let status = match child.wait() {
        Ok(s) => s,
        Err(e) => {
            return DownloadResult {
                success: false,
                cancelled: false,
                file_path: None,
                error: Some(format!("Process error: {}", e)),
            };
        }
    };

    if !status.success() {
        // Read stderr for error details
        let stderr = child
            .stderr
            .take()
            .and_then(|mut s| {
                let mut buf = String::new();
                std::io::Read::read_to_string(&mut s, &mut buf).ok()?;
                Some(buf)
            })
            .unwrap_or_default();

        return DownloadResult {
            success: false,
            cancelled: false,
            file_path: None,
            error: Some(format!("yt-dlp exited with error: {}", stderr.trim())),
        };
    }

    DownloadResult {
        success: true,
        cancelled: false,
        file_path,
        error: None,
    }
}

// ── Progress parsing ─────────────────────────────────────────────

fn parse_progress_line(line: &str) -> Option<DownloadProgress> {
    // Lines look like: [download]  45.2% of  5.23MiB at  2.34MiB/s ETA 00:02
    // or: [download] 100% of 5.23MiB in 00:02
    if !line.contains("[download]") || !line.contains('%') {
        return None;
    }

    let after_tag = line.split("[download]").nth(1)?.trim();
    let tokens: Vec<&str> = after_tag.split_whitespace().collect();

    if tokens.is_empty() {
        return None;
    }

    let percent_str = tokens[0].trim_end_matches('%');
    let percent: f64 = percent_str.parse().ok()?;

    let mut speed = None;
    let mut eta = None;

    for (i, token) in tokens.iter().enumerate() {
        if *token == "at" {
            speed = tokens.get(i + 1).map(|s| s.to_string());
        }
        if *token == "ETA" {
            eta = tokens.get(i + 1).map(|s| s.to_string());
        }
    }

    Some(DownloadProgress {
        phase: "downloading".to_string(),
        percent,
        speed,
        eta,
        title: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_progress_typical() {
        let line = "[download]  45.2% of  5.23MiB at  2.34MiB/s ETA 00:02";
        let p = parse_progress_line(line).unwrap();
        assert!((p.percent - 45.2).abs() < 0.01);
        assert_eq!(p.speed.as_deref(), Some("2.34MiB/s"));
        assert_eq!(p.eta.as_deref(), Some("00:02"));
        assert_eq!(p.phase, "downloading");
    }

    #[test]
    fn parse_progress_100() {
        let line = "[download] 100% of 5.23MiB in 00:02";
        let p = parse_progress_line(line).unwrap();
        assert!((p.percent - 100.0).abs() < 0.01);
    }

    #[test]
    fn parse_non_progress_line() {
        assert!(parse_progress_line("[info] Extracting URL").is_none());
        assert!(parse_progress_line("[ExtractAudio] Destination: /foo.flac").is_none());
        assert!(parse_progress_line("").is_none());
    }
}
