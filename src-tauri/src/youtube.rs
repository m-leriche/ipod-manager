use serde::Serialize;
use std::io::BufRead;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
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

    let chapters = json["chapters"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|ch| {
                    Some(Chapter {
                        title: ch["title"].as_str()?.to_string(),
                        start_time: ch["start_time"].as_f64()?,
                        end_time: ch["end_time"].as_f64()?,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(VideoInfo {
        title,
        duration,
        uploader,
        chapters,
    })
}

// ── Download ─────────────────────────────────────────────────────

pub fn download_audio(
    url: &str,
    output_dir: &str,
    format: &str,
    split_chapters: bool,
    chapter_count: usize,
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

    args.extend(["-o".to_string(), output_template]);

    if split_chapters {
        args.push("--split-chapters".to_string());
        args.extend([
            "-o".to_string(),
            format!(
                "chapter:{}/%(title)s/%(section_number)d. %(section_title)s.%(ext)s",
                output_dir
            ),
        ]);
    }

    args.extend([
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
                file_paths: vec![],
                error: Some(format!("Failed to start yt-dlp: {}", e)),
            };
        }
    };

    let Some(stdout) = child.stdout.take() else {
        return DownloadResult {
            success: false,
            cancelled: false,
            file_paths: vec![],
            error: Some("Failed to capture yt-dlp stdout".to_string()),
        };
    };

    // Drain stderr in a background thread to prevent pipe buffer deadlock
    let stderr_handle = child.stderr.take().map(|mut stderr| {
        std::thread::spawn(move || {
            let mut buf = String::new();
            std::io::Read::read_to_string(&mut stderr, &mut buf).unwrap_or_default();
            buf
        })
    });

    let reader = std::io::BufReader::new(stdout);
    let mut file_paths: Vec<String> = Vec::new();
    let mut download_dest: Option<String> = None;
    let mut full_file_path: Option<String> = None;
    let mut chapters_split: usize = 0;
    let in_split_mode = split_chapters && chapter_count > 0;

    for line in reader.lines() {
        if cancel_flag.load(Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            return DownloadResult {
                success: false,
                cancelled: true,
                file_paths: vec![],
                error: None,
            };
        }

        let Ok(line) = line else { continue };

        // Capture intermediate download destination (fallback for non-split)
        if line.contains("[download] Destination:") {
            if let Some(path) = line.split("Destination:").nth(1) {
                download_dest = Some(path.trim().to_string());
            }
        }

        // Chapter splitting progress — capture output paths and emit incremental progress
        if line.contains("[SplitChapters]") {
            if line.contains("Destination:") {
                if let Some(path) = line.split("Destination:").nth(1) {
                    file_paths.push(path.trim().to_string());
                }
            }
            chapters_split += 1;
            let percent = if chapter_count > 0 {
                (chapters_split as f64 / chapter_count as f64 * 100.0).min(100.0)
            } else {
                100.0
            };
            let _ = app.emit(
                "youtube-progress",
                DownloadProgress {
                    phase: "splitting".to_string(),
                    percent,
                    speed: None,
                    eta: None,
                    title: None,
                },
            );
            continue;
        }

        // Capture final audio file paths from ExtractAudio/ffmpeg lines
        if line.contains("[ExtractAudio]") || line.contains("[ffmpeg]") {
            if line.contains("Destination:") {
                if let Some(path) = line.split("Destination:").nth(1) {
                    let path = path.trim().to_string();
                    if in_split_mode {
                        // Full file before chapter split — save for cleanup, don't add to results
                        full_file_path = Some(path);
                    } else {
                        let name = std::path::Path::new(&path)
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .map(String::from);
                        file_paths.push(path);
                        let _ = app.emit(
                            "youtube-progress",
                            DownloadProgress {
                                phase: "converting".to_string(),
                                percent: 100.0,
                                speed: None,
                                eta: None,
                                title: name,
                            },
                        );
                    }
                }
            }
            continue;
        }

        if let Some(progress) = parse_progress_line(&line) {
            let _ = app.emit("youtube-progress", progress);
        }
    }

    // Fallback: if no ExtractAudio destinations captured, use download dest
    if file_paths.is_empty() {
        if let Some(path) = download_dest {
            file_paths.push(path);
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

        return DownloadResult {
            success: false,
            cancelled: false,
            file_paths: vec![],
            error: Some(format!("yt-dlp exited with error: {}", stderr.trim())),
        };
    }

    // Clean up the full audio file when chapters were split into individual tracks
    if in_split_mode {
        if let Some(ref path) = full_file_path {
            let _ = std::fs::remove_file(path);
        }
    }

    DownloadResult {
        success: true,
        cancelled: false,
        file_paths,
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
