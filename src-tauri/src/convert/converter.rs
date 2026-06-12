use std::io::BufRead;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use super::helpers::{build_codec_args, build_output_path, parse_ffmpeg_time};
use super::probe::probe_audio;
use super::{ConvertProgress, ConvertRequest, ConvertResult, ConvertedPair};
use crate::process;

/// Timeout for a single file conversion (30 minutes).
const CONVERT_TIMEOUT: Duration = Duration::from_secs(30 * 60);

pub fn convert_batch(
    requests: Vec<ConvertRequest>,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
) -> ConvertResult {
    let total = requests.len();
    let mut converted = 0usize;
    let mut failed = 0usize;
    let mut errors = Vec::new();
    let mut output_paths = Vec::new();
    let mut pairs = Vec::new();
    let mut warnings = Vec::new();

    log::info!("Starting batch conversion of {} files", total);

    for (i, req) in requests.iter().enumerate() {
        if cancel_flag.load(Ordering::SeqCst) {
            log::info!("Batch conversion cancelled after {}/{} files", i, total);
            return ConvertResult {
                success: converted > 0,
                cancelled: true,
                converted,
                failed,
                errors,
                output_paths,
                pairs,
                warnings,
            };
        }

        // Check for lossy-to-lossless warning
        if req.target_format == "flac" {
            if let Ok(info) = probe_audio(&req.input_path) {
                if !info.is_lossless {
                    warnings.push(format!(
                        "{}: lossy source ({}) wrapped in lossless FLAC container",
                        info.file_name, info.codec
                    ));
                }
            }
        }

        match convert_single(req, i, total, &app, &cancel_flag) {
            Ok(path) => {
                pairs.push(ConvertedPair {
                    input_path: req.input_path.clone(),
                    output_path: path.clone(),
                });
                output_paths.push(path);
                converted += 1;
            }
            Err(e) => {
                let file_name = Path::new(&req.input_path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("?");
                log::warn!("Conversion failed for {}: {}", file_name, e);
                errors.push(format!("{}: {}", file_name, e));
                failed += 1;
            }
        }
    }

    log::info!(
        "Batch conversion complete: {} converted, {} failed",
        converted,
        failed
    );

    ConvertResult {
        success: failed == 0 && converted > 0,
        cancelled: false,
        converted,
        failed,
        errors,
        output_paths,
        pairs,
        warnings,
    }
}

fn convert_single(
    req: &ConvertRequest,
    file_index: usize,
    total_files: usize,
    app: &AppHandle,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<String, String> {
    let input_path = &req.input_path;
    let file_name = Path::new(input_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file")
        .to_string();

    let _ = app.emit(
        "convert-progress",
        ConvertProgress {
            file_index,
            total_files,
            current_file: file_name.clone(),
            percent: 0.0,
            phase: "converting".to_string(),
        },
    );

    // Ensure output directory exists
    std::fs::create_dir_all(&req.output_dir)
        .map_err(|e| format!("Failed to create output dir: {}", e))?;

    let duration = probe_audio(input_path).map(|p| p.duration).unwrap_or(0.0);

    let output_path = build_output_path(input_path, &req.output_dir, &req.target_format);

    let codec_args = build_codec_args(req);
    let mut args = vec!["-i".to_string(), input_path.to_string(), "-vn".to_string()];
    args.extend(codec_args);
    args.extend([
        "-progress".to_string(),
        "pipe:1".to_string(),
        "-nostats".to_string(),
        "-y".to_string(),
        output_path.clone(),
    ]);

    let mut child = Command::new("ffmpeg")
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start ffmpeg: {}", e))?;

    let Some(stdout) = child.stdout.take() else {
        return Err("Failed to capture ffmpeg stdout".to_string());
    };

    let stderr_handle = process::drain_stderr(&mut child);

    let reader = std::io::BufReader::new(stdout);
    for line in reader.lines() {
        if cancel_flag.load(Ordering::SeqCst) {
            process::kill_and_wait(&mut child);
            let _ = std::fs::remove_file(&output_path);
            return Err("Cancelled".to_string());
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
                    "convert-progress",
                    ConvertProgress {
                        file_index,
                        total_files,
                        current_file: file_name.clone(),
                        percent,
                        phase: "converting".to_string(),
                    },
                );
            }
        }
    }

    let status = match process::wait_with_timeout(&mut child, CONVERT_TIMEOUT) {
        Ok(s) => s,
        Err(e) => {
            let stderr = process::collect_stderr(stderr_handle);
            log::error!(
                "ffmpeg conversion timed out: {} (stderr: {})",
                e,
                stderr.trim()
            );
            let _ = std::fs::remove_file(&output_path);
            return Err(format!("Process error: {}", e));
        }
    };

    if !status.success() {
        let stderr = process::collect_stderr(stderr_handle);
        let _ = std::fs::remove_file(&output_path);
        return Err(format!(
            "ffmpeg error: {}",
            stderr.lines().last().unwrap_or("unknown error").trim()
        ));
    }

    Ok(output_path)
}
