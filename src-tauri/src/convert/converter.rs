use rayon::prelude::*;
use std::io::BufRead;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tauri::AppHandle;

use super::helpers::{build_codec_args, build_output_path, parse_ffmpeg_time};
use super::probe::probe_audio;
use super::progress::BatchProgress;
use super::{ConvertRequest, ConvertResult, ConvertedPair};
use crate::process;

/// Timeout for a single file conversion (30 minutes).
const CONVERT_TIMEOUT: Duration = Duration::from_secs(30 * 60);

/// Bounded pool so a large batch spawns at most 4 concurrent ffmpeg processes.
fn convert_pool() -> &'static rayon::ThreadPool {
    static POOL: OnceLock<rayon::ThreadPool> = OnceLock::new();
    POOL.get_or_init(|| {
        let threads = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4)
            .min(4);
        rayon::ThreadPoolBuilder::new()
            .num_threads(threads)
            .thread_name(|i| format!("convert-worker-{}", i))
            .build()
            .expect("static thread pool with fixed config")
    })
}

enum FileOutcome {
    Converted {
        input: String,
        output: String,
    },
    Failed(String),
    /// Cancelled before the file was started.
    Skipped,
}

pub fn convert_batch(
    requests: Vec<ConvertRequest>,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
) -> ConvertResult {
    let total = requests.len();
    log::info!("Starting batch conversion of {} files", total);

    let progress = BatchProgress::new(app, total);
    let outcomes: Vec<(FileOutcome, Option<String>)> = convert_pool().install(|| {
        requests
            .par_iter()
            .enumerate()
            .map(|(i, req)| convert_one(i, req, &progress, &cancel_flag))
            .collect()
    });

    let result = aggregate(outcomes, cancel_flag.load(Ordering::SeqCst));
    log::info!(
        "Batch conversion complete: {} converted, {} failed{}",
        result.converted,
        result.failed,
        if result.cancelled { " (cancelled)" } else { "" }
    );
    result
}

fn convert_one(
    file_index: usize,
    req: &ConvertRequest,
    progress: &BatchProgress,
    cancel_flag: &Arc<AtomicBool>,
) -> (FileOutcome, Option<String>) {
    if cancel_flag.load(Ordering::SeqCst) {
        return (FileOutcome::Skipped, None);
    }

    let file_name = Path::new(&req.input_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("?")
        .to_string();

    let warning = lossy_to_flac_warning(req);

    let outcome = match convert_single(req, file_index, &file_name, progress, cancel_flag) {
        Ok(path) => FileOutcome::Converted {
            input: req.input_path.clone(),
            output: path,
        },
        Err(e) => {
            log::warn!("Conversion failed for {}: {}", file_name, e);
            FileOutcome::Failed(format!("{}: {}", file_name, e))
        }
    };
    progress.finish_file(file_index, &file_name);
    (outcome, warning)
}

fn lossy_to_flac_warning(req: &ConvertRequest) -> Option<String> {
    if req.target_format != "flac" {
        return None;
    }
    let info = probe_audio(&req.input_path).ok()?;
    if info.is_lossless {
        return None;
    }
    Some(format!(
        "{}: lossy source ({}) wrapped in lossless FLAC container",
        info.file_name, info.codec
    ))
}

/// Fold per-file outcomes (in request order) into the batch result.
fn aggregate(outcomes: Vec<(FileOutcome, Option<String>)>, cancelled: bool) -> ConvertResult {
    let mut result = ConvertResult {
        success: false,
        cancelled,
        converted: 0,
        failed: 0,
        errors: Vec::new(),
        output_paths: Vec::new(),
        pairs: Vec::new(),
        warnings: Vec::new(),
    };

    for (outcome, warning) in outcomes {
        if let Some(w) = warning {
            result.warnings.push(w);
        }
        match outcome {
            FileOutcome::Converted { input, output } => {
                result.pairs.push(ConvertedPair {
                    input_path: input,
                    output_path: output.clone(),
                });
                result.output_paths.push(output);
                result.converted += 1;
            }
            FileOutcome::Failed(e) => {
                result.errors.push(e);
                result.failed += 1;
            }
            FileOutcome::Skipped => {}
        }
    }

    result.success = if cancelled {
        result.converted > 0
    } else {
        result.failed == 0 && result.converted > 0
    };
    result
}

fn convert_single(
    req: &ConvertRequest,
    file_index: usize,
    file_name: &str,
    progress: &BatchProgress,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<String, String> {
    let input_path = &req.input_path;

    progress.update(file_index, file_name, 0.0);

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
        // `--` ends option parsing so an output path beginning with `-` is
        // treated as a filename, not an ffmpeg flag.
        "--".to_string(),
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
                progress.update(file_index, file_name, percent);
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

#[cfg(test)]
mod tests {
    use super::*;

    fn converted(n: usize) -> (FileOutcome, Option<String>) {
        (
            FileOutcome::Converted {
                input: format!("in{}.wav", n),
                output: format!("out{}.flac", n),
            },
            None,
        )
    }

    #[test]
    fn aggregate_preserves_request_order() {
        let outcomes = vec![converted(0), converted(1), converted(2)];
        let result = aggregate(outcomes, false);
        assert_eq!(
            result.output_paths,
            vec!["out0.flac", "out1.flac", "out2.flac"]
        );
        assert_eq!(result.pairs[1].input_path, "in1.wav");
        assert_eq!(result.pairs[1].output_path, "out1.flac");
        assert!(result.success);
        assert_eq!(result.converted, 3);
    }

    #[test]
    fn aggregate_counts_failures_and_collects_errors() {
        let outcomes = vec![
            converted(0),
            (FileOutcome::Failed("b.wav: ffmpeg error".to_string()), None),
        ];
        let result = aggregate(outcomes, false);
        assert!(!result.success);
        assert_eq!(result.converted, 1);
        assert_eq!(result.failed, 1);
        assert_eq!(result.errors, vec!["b.wav: ffmpeg error"]);
        assert_eq!(result.output_paths, vec!["out0.flac"]);
    }

    #[test]
    fn aggregate_cancelled_ignores_skipped_files() {
        let outcomes = vec![converted(0), (FileOutcome::Skipped, None)];
        let result = aggregate(outcomes, true);
        assert!(result.cancelled);
        assert!(result.success, "partial conversion counts as success");
        assert_eq!(result.converted, 1);
        assert_eq!(result.failed, 0);
        assert!(result.errors.is_empty());
    }

    #[test]
    fn aggregate_collects_warnings_even_for_failed_files() {
        let outcomes = vec![(
            FileOutcome::Failed("a.mp3: ffmpeg error".to_string()),
            Some("a.mp3: lossy source (mp3) wrapped in lossless FLAC container".to_string()),
        )];
        let result = aggregate(outcomes, false);
        assert_eq!(result.warnings.len(), 1);
        assert!(!result.success);
    }

    #[test]
    fn aggregate_empty_batch_is_not_success() {
        let result = aggregate(Vec::new(), false);
        assert!(!result.success);
        assert!(!result.cancelled);
        assert_eq!(result.converted, 0);
    }
}
