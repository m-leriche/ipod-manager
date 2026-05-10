use std::io::BufRead;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

use super::progress::parse_progress_line;
use super::{validate_url, Chapter, DownloadProgress, DownloadResult};
use crate::localvideo;

pub fn download_audio(
    url: &str,
    output_dir: &str,
    format: &str,
    chapters: Vec<Chapter>,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
) -> DownloadResult {
    if let Err(e) = validate_url(url) {
        return DownloadResult {
            success: false,
            cancelled: false,
            file_paths: vec![],
            error: Some(e),
        };
    }
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

        if line.contains("[download] Destination:") {
            if let Some(path) = line.split("Destination:").nth(1) {
                download_dest = Some(path.trim().to_string());
            }
        }

        if line.contains("[ExtractAudio]") || line.contains("[ffmpeg]") {
            if line.contains("Destination:") {
                if let Some(path) = line.split("Destination:").nth(1) {
                    let path = path.trim().to_string();
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

    // Split into chapters using ffmpeg if chapters were provided
    if !chapters.is_empty() {
        let full_file = match file_paths.first() {
            Some(p) => p.clone(),
            None => {
                return DownloadResult {
                    success: false,
                    cancelled: false,
                    file_paths: vec![],
                    error: Some("Could not determine downloaded file path".to_string()),
                };
            }
        };

        let title = std::path::Path::new(&full_file)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("audio")
            .to_string();

        let chapter_dir = format!("{}/{}", output_dir, localvideo::sanitize_filename(&title));
        if let Err(e) = std::fs::create_dir_all(&chapter_dir) {
            return DownloadResult {
                success: false,
                cancelled: false,
                file_paths: vec![],
                error: Some(format!("Failed to create chapter directory: {}", e)),
            };
        }

        let total = chapters.len();
        let mut chapter_paths: Vec<String> = Vec::new();

        for (i, chapter) in chapters.iter().enumerate() {
            if cancel_flag.load(Ordering::SeqCst) {
                return DownloadResult {
                    success: false,
                    cancelled: true,
                    file_paths: chapter_paths,
                    error: None,
                };
            }

            let _ = app.emit(
                "youtube-progress",
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
                localvideo::sanitize_filename(&chapter.title),
                format
            );

            let mut ffmpeg_args = vec![
                "-i".to_string(),
                full_file.clone(),
                "-vn".to_string(),
                "-ss".to_string(),
                format!("{}", chapter.start_time),
                "-to".to_string(),
                format!("{}", chapter.end_time),
            ];
            ffmpeg_args.extend(localvideo::build_codec_args(format));
            ffmpeg_args.extend([
                "-metadata".to_string(),
                format!("track={}/{}", i + 1, total),
                "-metadata".to_string(),
                format!("title={}", chapter.title),
                "-y".to_string(),
                output_path.clone(),
            ]);

            let output = match Command::new("ffmpeg").args(&ffmpeg_args).output() {
                Ok(o) => o,
                Err(e) => {
                    return DownloadResult {
                        success: false,
                        cancelled: false,
                        file_paths: chapter_paths,
                        error: Some(format!("Failed to run ffmpeg: {}", e)),
                    };
                }
            };

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return DownloadResult {
                    success: false,
                    cancelled: false,
                    file_paths: chapter_paths,
                    error: Some(format!(
                        "ffmpeg failed on chapter {}: {}",
                        i + 1,
                        stderr.lines().last().unwrap_or("unknown error").trim()
                    )),
                };
            }

            chapter_paths.push(output_path);
        }

        let _ = app.emit(
            "youtube-progress",
            DownloadProgress {
                phase: "splitting".to_string(),
                percent: 100.0,
                speed: None,
                eta: None,
                title: None,
            },
        );

        let _ = std::fs::remove_file(&full_file);

        return DownloadResult {
            success: true,
            cancelled: false,
            file_paths: chapter_paths,
            error: None,
        };
    }

    DownloadResult {
        success: true,
        cancelled: false,
        file_paths,
        error: None,
    }
}
