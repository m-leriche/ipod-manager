use serde::Serialize;
use std::io::BufRead;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

use crate::youtube::{Chapter, DownloadProgress, DownloadResult};

#[derive(Debug, Clone, Serialize)]
pub struct VideoProbe {
    pub title: String,
    pub duration: f64,
    pub duration_display: String,
}

// ── Dependency check ─────────────────────────────────────────────

pub fn check_ffmpeg() -> Result<(), String> {
    let mut missing = Vec::new();
    for tool in &["ffmpeg", "ffprobe"] {
        if Command::new("which")
            .arg(tool)
            .output()
            .map(|o| !o.status.success())
            .unwrap_or(true)
        {
            missing.push(*tool);
        }
    }
    if missing.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "Missing required tools: {}. Install with: brew install ffmpeg",
            missing.join(", ")
        ))
    }
}

// ── Video probe ──────────────────────────────────────────────────

pub fn probe_video(path: &str) -> Result<VideoProbe, String> {
    let p = Path::new(path);
    if !p.exists() {
        return Err(format!("File does not exist: {}", path));
    }

    let output = Command::new("ffprobe")
        .args(["-v", "quiet", "-print_format", "json", "-show_format", path])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe error: {}", stderr.trim()));
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse ffprobe output: {}", e))?;

    let duration = json["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);

    let title = p
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_string();

    let total_secs = duration as u64;
    let hours = total_secs / 3600;
    let mins = (total_secs % 3600) / 60;
    let secs = total_secs % 60;
    let duration_display = if hours > 0 {
        format!("{}:{:02}:{:02}", hours, mins, secs)
    } else {
        format!("{}:{:02}", mins, secs)
    };

    Ok(VideoProbe {
        title,
        duration,
        duration_display,
    })
}

// ── Audio extraction ─────────────────────────────────────────────

pub fn extract_audio(
    path: &str,
    output_dir: &str,
    format: &str,
    chapters: Vec<Chapter>,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
) -> DownloadResult {
    if format != "flac" && format != "mp3" {
        return DownloadResult {
            success: false,
            cancelled: false,
            file_paths: vec![],
            error: Some(format!("Invalid format: {}", format)),
        };
    }

    let src = Path::new(path);
    let title = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("audio")
        .to_string();

    if chapters.is_empty() {
        extract_single(path, output_dir, format, &title, &app, &cancel_flag)
    } else {
        extract_chapters(
            path,
            output_dir,
            format,
            &title,
            &chapters,
            &app,
            &cancel_flag,
        )
    }
}

pub fn build_codec_args(format: &str) -> Vec<String> {
    match format {
        "flac" => vec!["-acodec", "flac", "-ar", "44100", "-sample_fmt", "s16"],
        "mp3" => vec!["-acodec", "libmp3lame", "-q:a", "0"],
        _ => vec![],
    }
    .into_iter()
    .map(String::from)
    .collect()
}

fn extract_single(
    path: &str,
    output_dir: &str,
    format: &str,
    title: &str,
    app: &AppHandle,
    cancel_flag: &Arc<AtomicBool>,
) -> DownloadResult {
    let output_path = format!("{}/{}.{}", output_dir, sanitize_filename(title), format);
    let duration = probe_video(path).map(|p| p.duration).unwrap_or(0.0);

    let mut args = vec!["-i".to_string(), path.to_string(), "-vn".to_string()];
    args.extend(build_codec_args(format));
    args.extend([
        "-progress".to_string(),
        "pipe:1".to_string(),
        "-nostats".to_string(),
        "-y".to_string(),
        output_path.clone(),
    ]);

    let mut child = match Command::new("ffmpeg")
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
                file_paths: vec![],
                error: Some(format!("Failed to start ffmpeg: {}", e)),
            };
        }
    };

    let Some(stdout) = child.stdout.take() else {
        return DownloadResult {
            success: false,
            cancelled: false,
            file_paths: vec![],
            error: Some("Failed to capture ffmpeg stdout".to_string()),
        };
    };

    // Drain stderr in background to prevent pipe deadlock
    let stderr_handle = child.stderr.take().map(|mut stderr| {
        std::thread::spawn(move || {
            let mut buf = String::new();
            std::io::Read::read_to_string(&mut stderr, &mut buf).unwrap_or_default();
            buf
        })
    });

    let reader = std::io::BufReader::new(stdout);

    for line in reader.lines() {
        if cancel_flag.load(Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            let _ = std::fs::remove_file(&output_path);
            return DownloadResult {
                success: false,
                cancelled: true,
                file_paths: vec![],
                error: None,
            };
        }

        let Ok(line) = line else { continue };

        if let Some(time_str) = line.strip_prefix("out_time=") {
            if let Some(secs) = parse_ffmpeg_time(time_str) {
                let percent = if duration > 0.0 {
                    (secs / duration * 100.0).min(100.0)
                } else {
                    0.0
                };
                let _ = app.emit(
                    "video-extract-progress",
                    DownloadProgress {
                        phase: "converting".to_string(),
                        percent,
                        speed: None,
                        eta: None,
                        title: None,
                    },
                );
            }
        }
    }

    let status = match child.wait() {
        Ok(s) => s,
        Err(e) => {
            return DownloadResult {
                success: false,
                cancelled: false,
                file_paths: vec![],
                error: Some(format!("Process error: {}", e)),
            };
        }
    };

    if !status.success() {
        let stderr = stderr_handle
            .and_then(|h| h.join().ok())
            .unwrap_or_default();
        let _ = std::fs::remove_file(&output_path);
        return DownloadResult {
            success: false,
            cancelled: false,
            file_paths: vec![],
            error: Some(format!(
                "ffmpeg error: {}",
                stderr.lines().last().unwrap_or("unknown error").trim()
            )),
        };
    }

    DownloadResult {
        success: true,
        cancelled: false,
        file_paths: vec![output_path],
        error: None,
    }
}

fn extract_chapters(
    path: &str,
    output_dir: &str,
    format: &str,
    title: &str,
    chapters: &[Chapter],
    app: &AppHandle,
    cancel_flag: &Arc<AtomicBool>,
) -> DownloadResult {
    let chapter_dir = format!("{}/{}", output_dir, sanitize_filename(title));
    if let Err(e) = std::fs::create_dir_all(&chapter_dir) {
        return DownloadResult {
            success: false,
            cancelled: false,
            file_paths: vec![],
            error: Some(format!("Failed to create output directory: {}", e)),
        };
    }

    let total = chapters.len();
    let mut file_paths: Vec<String> = Vec::new();

    for (i, chapter) in chapters.iter().enumerate() {
        if cancel_flag.load(Ordering::SeqCst) {
            return DownloadResult {
                success: false,
                cancelled: true,
                file_paths,
                error: None,
            };
        }

        let _ = app.emit(
            "video-extract-progress",
            DownloadProgress {
                phase: "splitting".to_string(),
                percent: (i as f64 / total as f64 * 100.0).min(100.0),
                speed: None,
                eta: None,
                title: Some(chapter.title.clone()),
            },
        );

        let output_path = format!(
            "{}/{:02}. {}.{}",
            chapter_dir,
            i + 1,
            sanitize_filename(&chapter.title),
            format
        );

        let mut args = vec![
            "-i".to_string(),
            path.to_string(),
            "-vn".to_string(),
            "-ss".to_string(),
            format!("{}", chapter.start_time),
            "-to".to_string(),
            format!("{}", chapter.end_time),
        ];
        args.extend(build_codec_args(format));
        args.extend([
            "-metadata".to_string(),
            format!("track={}/{}", i + 1, total),
            "-metadata".to_string(),
            format!("title={}", chapter.title),
            "-y".to_string(),
            output_path.clone(),
        ]);

        let output = match Command::new("ffmpeg").args(&args).output() {
            Ok(o) => o,
            Err(e) => {
                return DownloadResult {
                    success: false,
                    cancelled: false,
                    file_paths,
                    error: Some(format!("Failed to run ffmpeg: {}", e)),
                };
            }
        };

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return DownloadResult {
                success: false,
                cancelled: false,
                file_paths,
                error: Some(format!(
                    "ffmpeg failed on chapter {}: {}",
                    i + 1,
                    stderr.lines().last().unwrap_or("unknown error").trim()
                )),
            };
        }

        file_paths.push(output_path);
    }

    let _ = app.emit(
        "video-extract-progress",
        DownloadProgress {
            phase: "splitting".to_string(),
            percent: 100.0,
            speed: None,
            eta: None,
            title: None,
        },
    );

    DownloadResult {
        success: true,
        cancelled: false,
        file_paths,
        error: None,
    }
}

pub fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect()
}

fn parse_ffmpeg_time(time_str: &str) -> Option<f64> {
    let parts: Vec<&str> = time_str.trim().split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let h: f64 = parts[0].parse().ok()?;
    let m: f64 = parts[1].parse().ok()?;
    let s: f64 = parts[2].parse().ok()?;
    let secs = h * 3600.0 + m * 60.0 + s;
    if secs >= 0.0 {
        Some(secs)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_removes_bad_chars() {
        assert_eq!(sanitize_filename("Song: \"Best\" <1>"), "Song_ _Best_ _1_");
        assert_eq!(sanitize_filename("normal name"), "normal name");
    }

    #[test]
    fn parse_ffmpeg_time_valid() {
        let secs = parse_ffmpeg_time("00:01:23.456789").unwrap();
        assert!((secs - 83.456789).abs() < 0.001);

        let secs = parse_ffmpeg_time("01:00:00.000000").unwrap();
        assert!((secs - 3600.0).abs() < 0.001);
    }

    #[test]
    fn parse_ffmpeg_time_zero() {
        let secs = parse_ffmpeg_time("00:00:00.000000").unwrap();
        assert!((secs - 0.0).abs() < 0.001);
    }

    #[test]
    fn parse_ffmpeg_time_invalid() {
        assert!(parse_ffmpeg_time("invalid").is_none());
        assert!(parse_ffmpeg_time("").is_none());
        assert!(parse_ffmpeg_time("12:34").is_none());
    }
}
