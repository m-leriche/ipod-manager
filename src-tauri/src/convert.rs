use serde::{Deserialize, Serialize};
use std::io::BufRead;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

use crate::localvideo::sanitize_filename;

// ── Types ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct ConvertRequest {
    pub input_path: String,
    pub output_dir: String,
    pub target_format: String,
    pub mp3_bitrate: Option<u32>,
    pub flac_sample_rate: Option<u32>,
    pub flac_bit_depth: Option<u16>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AudioProbeInfo {
    pub file_path: String,
    pub file_name: String,
    pub codec: String,
    pub sample_rate: u32,
    pub bit_depth: Option<u16>,
    pub bitrate_kbps: Option<u64>,
    pub duration: f64,
    pub channels: u32,
    pub is_lossless: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConvertProgress {
    pub file_index: usize,
    pub total_files: usize,
    pub current_file: String,
    pub percent: f64,
    pub phase: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConvertResult {
    pub success: bool,
    pub cancelled: bool,
    pub converted: usize,
    pub failed: usize,
    pub errors: Vec<String>,
    pub output_paths: Vec<String>,
    pub warnings: Vec<String>,
}

// ── Probe ───────────────────────────────────────────────────────

pub fn probe_audio(path: &str) -> Result<AudioProbeInfo, String> {
    let p = Path::new(path);
    if !p.exists() {
        return Err(format!("File does not exist: {}", path));
    }

    let output = Command::new("ffprobe")
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            "-select_streams",
            "a:0",
            path,
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe error: {}", stderr.trim()));
    }

    let json: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("Parse error: {}", e))?;

    let stream = json["streams"]
        .as_array()
        .and_then(|s| s.first())
        .unwrap_or(&serde_json::Value::Null);

    let codec = stream["codec_name"]
        .as_str()
        .unwrap_or("unknown")
        .to_string();

    let sample_rate = stream["sample_rate"]
        .as_str()
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(0);

    let bit_depth = stream["bits_per_raw_sample"]
        .as_str()
        .and_then(|s| s.parse::<u16>().ok())
        .or_else(|| {
            stream["bits_per_sample"]
                .as_u64()
                .map(|b| b as u16)
                .filter(|&b| b > 0)
        });

    let bitrate_kbps = stream["bit_rate"]
        .as_str()
        .and_then(|s| s.parse::<u64>().ok())
        .map(|b| b / 1000)
        .or_else(|| {
            json["format"]["bit_rate"]
                .as_str()
                .and_then(|s| s.parse::<u64>().ok())
                .map(|b| b / 1000)
        });

    let duration = json["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);

    let channels = stream["channels"].as_u64().unwrap_or(2) as u32;

    let is_lossless = matches!(
        codec.as_str(),
        "flac" | "alac" | "wav" | "pcm_s16le" | "pcm_s24le" | "pcm_s32le" | "wavpack" | "aiff"
    );

    let file_name = p
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(path)
        .to_string();

    Ok(AudioProbeInfo {
        file_path: path.to_string(),
        file_name,
        codec,
        sample_rate,
        bit_depth,
        bitrate_kbps,
        duration,
        channels,
        is_lossless,
    })
}

pub fn probe_audio_batch(
    paths: &[String],
    app: &AppHandle,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<Vec<AudioProbeInfo>, String> {
    let total = paths.len();
    let mut results = Vec::with_capacity(total);

    for (i, path) in paths.iter().enumerate() {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err("Cancelled".to_string());
        }

        let file_name = Path::new(path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(path)
            .to_string();

        let _ = app.emit(
            "convert-progress",
            ConvertProgress {
                file_index: i,
                total_files: total,
                current_file: file_name,
                percent: 0.0,
                phase: "probing".to_string(),
            },
        );

        match probe_audio(path) {
            Ok(info) => results.push(info),
            Err(e) => {
                results.push(AudioProbeInfo {
                    file_path: path.clone(),
                    file_name: Path::new(path)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("?")
                        .to_string(),
                    codec: "error".to_string(),
                    sample_rate: 0,
                    bit_depth: None,
                    bitrate_kbps: None,
                    duration: 0.0,
                    channels: 0,
                    is_lossless: false,
                });
                log::warn!("Probe failed for {}: {}", path, e);
            }
        }
    }

    Ok(results)
}

// ── Conversion ──────────────────────────────────────────────────

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
    let mut warnings = Vec::new();

    for (i, req) in requests.iter().enumerate() {
        if cancel_flag.load(Ordering::SeqCst) {
            return ConvertResult {
                success: converted > 0,
                cancelled: true,
                converted,
                failed,
                errors,
                output_paths,
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
                output_paths.push(path);
                converted += 1;
            }
            Err(e) => {
                let file_name = Path::new(&req.input_path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("?");
                errors.push(format!("{}: {}", file_name, e));
                failed += 1;
            }
        }
    }

    ConvertResult {
        success: failed == 0 && !errors.is_empty() || converted > 0,
        cancelled: false,
        converted,
        failed,
        errors,
        output_paths,
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

    // Drain stderr in background
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

    let status = child.wait().map_err(|e| format!("Process error: {}", e))?;

    if !status.success() {
        let stderr = stderr_handle
            .and_then(|h| h.join().ok())
            .unwrap_or_default();
        let _ = std::fs::remove_file(&output_path);
        return Err(format!(
            "ffmpeg error: {}",
            stderr.lines().last().unwrap_or("unknown error").trim()
        ));
    }

    Ok(output_path)
}

// ── Helpers ─────────────────────────────────────────────────────

fn build_codec_args(req: &ConvertRequest) -> Vec<String> {
    match req.target_format.as_str() {
        "mp3" => {
            let bitrate = req.mp3_bitrate.unwrap_or(320);
            vec![
                "-acodec".to_string(),
                "libmp3lame".to_string(),
                "-b:a".to_string(),
                format!("{}k", bitrate),
            ]
        }
        "flac" => {
            let mut args = vec!["-acodec".to_string(), "flac".to_string()];
            if let Some(sr) = req.flac_sample_rate {
                args.extend(["-ar".to_string(), sr.to_string()]);
            }
            if let Some(bd) = req.flac_bit_depth {
                let sample_fmt = match bd {
                    16 => "s16",
                    24 => "s32",
                    _ => "s16",
                };
                args.extend(["-sample_fmt".to_string(), sample_fmt.to_string()]);
            }
            args
        }
        _ => vec![],
    }
}

fn build_output_path(input_path: &str, output_dir: &str, target_format: &str) -> String {
    let stem = Path::new(input_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("converted");
    let stem = sanitize_filename(stem);
    let base = format!("{}/{}.{}", output_dir, stem, target_format);
    if !Path::new(&base).exists() {
        return base;
    }
    for i in 1.. {
        let candidate = format!("{}/{} ({}).{}", output_dir, stem, i, target_format);
        if !Path::new(&candidate).exists() {
            return candidate;
        }
    }
    base
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
    fn build_codec_args_mp3_320() {
        let req = ConvertRequest {
            input_path: "test.flac".to_string(),
            output_dir: "/tmp".to_string(),
            target_format: "mp3".to_string(),
            mp3_bitrate: Some(320),
            flac_sample_rate: None,
            flac_bit_depth: None,
        };
        let args = build_codec_args(&req);
        assert_eq!(args, vec!["-acodec", "libmp3lame", "-b:a", "320k"]);
    }

    #[test]
    fn build_codec_args_mp3_128() {
        let req = ConvertRequest {
            input_path: "test.flac".to_string(),
            output_dir: "/tmp".to_string(),
            target_format: "mp3".to_string(),
            mp3_bitrate: Some(128),
            flac_sample_rate: None,
            flac_bit_depth: None,
        };
        let args = build_codec_args(&req);
        assert_eq!(args, vec!["-acodec", "libmp3lame", "-b:a", "128k"]);
    }

    #[test]
    fn build_codec_args_flac_16_44() {
        let req = ConvertRequest {
            input_path: "test.flac".to_string(),
            output_dir: "/tmp".to_string(),
            target_format: "flac".to_string(),
            mp3_bitrate: None,
            flac_sample_rate: Some(44100),
            flac_bit_depth: Some(16),
        };
        let args = build_codec_args(&req);
        assert_eq!(
            args,
            vec!["-acodec", "flac", "-ar", "44100", "-sample_fmt", "s16"]
        );
    }

    #[test]
    fn build_codec_args_flac_24_96() {
        let req = ConvertRequest {
            input_path: "test.flac".to_string(),
            output_dir: "/tmp".to_string(),
            target_format: "flac".to_string(),
            mp3_bitrate: None,
            flac_sample_rate: Some(96000),
            flac_bit_depth: Some(24),
        };
        let args = build_codec_args(&req);
        assert_eq!(
            args,
            vec!["-acodec", "flac", "-ar", "96000", "-sample_fmt", "s32"]
        );
    }

    #[test]
    fn build_codec_args_flac_original() {
        let req = ConvertRequest {
            input_path: "test.flac".to_string(),
            output_dir: "/tmp".to_string(),
            target_format: "flac".to_string(),
            mp3_bitrate: None,
            flac_sample_rate: None,
            flac_bit_depth: None,
        };
        let args = build_codec_args(&req);
        assert_eq!(args, vec!["-acodec", "flac"]);
    }

    #[test]
    fn build_output_path_no_collision() {
        let path = build_output_path("/music/song.flac", "/tmp/nonexistent_dir_xyz", "mp3");
        assert!(path.ends_with("/song.mp3"));
    }
}
