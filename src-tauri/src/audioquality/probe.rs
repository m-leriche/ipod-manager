use std::path::Path;
use std::process::Command;

use super::transcode::detect_transcode;
use super::{format_sample_rate, highpass_cutoff, is_lossless_codec, AudioFileInfo};

pub(super) fn probe_audio_file(path: &Path) -> Result<AudioFileInfo, String> {
    let file_path = path.to_string_lossy().to_string();
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let output = Command::new("ffprobe")
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
            // `--` ends option parsing so a path beginning with `-` is treated
            // as a filename, not an ffprobe flag.
            "--",
            &file_path,
        ])
        .output()
        .map_err(|e| format!("ffprobe failed: {}", e))?;

    if !output.status.success() {
        return Err(format!("ffprobe error on {}", file_name));
    }

    let json: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("Parse error: {}", e))?;

    // Find first audio stream
    let stream = json["streams"]
        .as_array()
        .and_then(|streams| {
            streams
                .iter()
                .find(|s| s["codec_type"].as_str() == Some("audio"))
        })
        .ok_or_else(|| format!("No audio stream in {}", file_name))?;

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
                .as_str()
                .and_then(|s| s.parse::<u16>().ok())
        });

    let bitrate = stream["bit_rate"]
        .as_str()
        .and_then(|s| s.parse::<u64>().ok())
        .or_else(|| {
            json["format"]["bit_rate"]
                .as_str()
                .and_then(|s| s.parse::<u64>().ok())
        });

    let channels = stream["channels"].as_u64().unwrap_or(0) as u16;

    let duration = json["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);

    let lossless = is_lossless_codec(&codec);

    // Determine verdict
    let (verdict, verdict_reason) = if !lossless {
        let kbps = bitrate.map(|b| b / 1000).unwrap_or(0);
        (
            "lossy".to_string(),
            format!("{} @ {}kbps", codec.to_uppercase(), kbps),
        )
    } else {
        // Check for transcode
        match detect_transcode(path, sample_rate) {
            Ok(true) => {
                let cutoff = highpass_cutoff(sample_rate) / 1000;
                (
                    "suspect".to_string(),
                    format!("Low energy above {}kHz — possible transcode", cutoff),
                )
            }
            Ok(false) => {
                let depth = bit_depth.map(|d| format!("{}-bit", d)).unwrap_or_default();
                let rate = format_sample_rate(sample_rate);
                (
                    "lossless".to_string(),
                    format!("{} {} / {}", codec.to_uppercase(), rate, depth),
                )
            }
            Err(_) => {
                // Can't determine — default to lossless
                let depth = bit_depth.map(|d| format!("{}-bit", d)).unwrap_or_default();
                let rate = format_sample_rate(sample_rate);
                (
                    "lossless".to_string(),
                    format!("{} {} / {}", codec.to_uppercase(), rate, depth),
                )
            }
        }
    };

    Ok(AudioFileInfo {
        file_path,
        file_name,
        codec,
        sample_rate,
        bit_depth,
        bitrate,
        channels,
        duration,
        is_lossless_container: lossless,
        verdict,
        verdict_reason,
    })
}
