use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

use super::{AudioProbeInfo, ConvertProgress};

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
            // `--` ends option parsing so a path beginning with `-` is treated
            // as a filename, not an ffprobe flag.
            "--",
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
