use std::io::BufRead;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use super::progress::parse_progress_line;
use super::{validate_url, Chapter, DownloadProgress, DownloadResult};
use crate::localvideo;
use crate::process;

/// Timeout for the main yt-dlp download process (30 minutes).
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(30 * 60);

/// Timeout for individual chapter split operations (5 minutes per chapter).
const CHAPTER_SPLIT_TIMEOUT: Duration = Duration::from_secs(5 * 60);

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

    log::info!("Starting YouTube download: url={}, format={}", url, format);

    let output_template = format!("{}/%(title)s.%(ext)s", output_dir);

    let mut args = vec![
        "--ignore-config".to_string(),
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
        // `--` terminates option parsing so a URL beginning with `-` can't be
        // interpreted as a yt-dlp flag (e.g. --exec for arbitrary execution).
        "--".to_string(),
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
            log::error!("Failed to start yt-dlp: {}", e);
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

    let stderr_handle = process::drain_stderr(&mut child);

    let reader = std::io::BufReader::new(stdout);
    let mut file_paths: Vec<String> = Vec::new();
    let mut download_dest: Option<String> = None;

    for line in reader.lines() {
        if cancel_flag.load(Ordering::SeqCst) {
            log::info!("YouTube download cancelled by user");
            process::kill_and_wait(&mut child);
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

    let status = match process::wait_with_timeout(&mut child, DOWNLOAD_TIMEOUT) {
        Ok(s) => s,
        Err(e) => {
            let stderr = process::collect_stderr(stderr_handle);
            log::error!("yt-dlp process error: {} (stderr: {})", e, stderr.trim());
            process::cleanup_files(&file_paths);
            return DownloadResult {
                success: false,
                cancelled: false,
                file_paths: vec![],
                error: Some(format!("Process error: {}", e)),
            };
        }
    };

    if !status.success() {
        let stderr = process::collect_stderr(stderr_handle);
        log::error!("yt-dlp exited with error: {}", stderr.trim());
        process::cleanup_files(&file_paths);
        return DownloadResult {
            success: false,
            cancelled: false,
            file_paths: vec![],
            error: Some(format!("yt-dlp exited with error: {}", stderr.trim())),
        };
    }

    log::info!("YouTube download complete, {} files", file_paths.len());

    // Split into chapters using ffmpeg if chapters were provided
    if !chapters.is_empty() {
        return split_chapters(
            &file_paths,
            output_dir,
            format,
            &chapters,
            &app,
            &cancel_flag,
        );
    }

    DownloadResult {
        success: true,
        cancelled: false,
        file_paths,
        error: None,
    }
}

fn split_chapters(
    file_paths: &[String],
    output_dir: &str,
    format: &str,
    chapters: &[Chapter],
    app: &AppHandle,
    cancel_flag: &Arc<AtomicBool>,
) -> DownloadResult {
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

    log::info!(
        "Splitting into {} chapters in {}",
        chapters.len(),
        chapter_dir
    );

    let total = chapters.len();
    let mut chapter_paths: Vec<String> = Vec::new();

    for (i, chapter) in chapters.iter().enumerate() {
        if cancel_flag.load(Ordering::SeqCst) {
            log::info!(
                "Chapter splitting cancelled, cleaning up {} files",
                chapter_paths.len()
            );
            process::cleanup_files(&chapter_paths);
            process::cleanup_dir(&chapter_dir);
            let _ = std::fs::remove_file(&full_file);
            return DownloadResult {
                success: false,
                cancelled: true,
                file_paths: vec![],
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
            format!(
                "{}={}/{}",
                localvideo::track_number_key(format),
                i + 1,
                total
            ),
            "-metadata".to_string(),
            format!("title={}", chapter.title),
            "-y".to_string(),
            // `--` ends option parsing so an output path beginning with `-` is
            // treated as a filename, not an ffmpeg flag.
            "--".to_string(),
            output_path.clone(),
        ]);

        let mut child = match Command::new("ffmpeg")
            .args(&ffmpeg_args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => {
                log::error!("Failed to start ffmpeg for chapter {}: {}", i + 1, e);
                process::cleanup_files(&chapter_paths);
                process::cleanup_dir(&chapter_dir);
                // Intentionally keep full_file: the download succeeded, only splitting
                // failed — the user retains the working full-length file.
                return DownloadResult {
                    success: false,
                    cancelled: false,
                    file_paths: vec![],
                    error: Some(format!("Failed to run ffmpeg: {}", e)),
                };
            }
        };

        let stderr_handle = process::drain_stderr(&mut child);

        match process::wait_with_timeout(&mut child, CHAPTER_SPLIT_TIMEOUT) {
            Ok(status) if status.success() => {
                chapter_paths.push(output_path);
            }
            Ok(_status) => {
                let stderr = process::collect_stderr(stderr_handle);
                log::error!("ffmpeg failed on chapter {}: {}", i + 1, stderr.trim());
                process::cleanup_files(&chapter_paths);
                process::cleanup_dir(&chapter_dir);
                // Intentionally keep full_file: the download succeeded, only splitting
                // failed — the user retains the working full-length file.
                return DownloadResult {
                    success: false,
                    cancelled: false,
                    file_paths: vec![],
                    error: Some(format!(
                        "ffmpeg failed on chapter {}: {}",
                        i + 1,
                        stderr.lines().last().unwrap_or("unknown error").trim()
                    )),
                };
            }
            Err(e) => {
                let stderr = process::collect_stderr(stderr_handle);
                log::error!(
                    "ffmpeg timed out on chapter {}: {} (stderr: {})",
                    i + 1,
                    e,
                    stderr.trim()
                );
                process::cleanup_files(&chapter_paths);
                process::cleanup_dir(&chapter_dir);
                // Intentionally keep full_file: the download succeeded, only splitting
                // failed — the user retains the working full-length file.
                return DownloadResult {
                    success: false,
                    cancelled: false,
                    file_paths: vec![],
                    error: Some(format!("ffmpeg timed out on chapter {}: {}", i + 1, e)),
                };
            }
        }
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

    // Remove the original full file now that chapters are split
    let _ = std::fs::remove_file(&full_file);

    log::info!("Chapter splitting complete, {} files", chapter_paths.len());

    DownloadResult {
        success: true,
        cancelled: false,
        file_paths: chapter_paths,
        error: None,
    }
}
