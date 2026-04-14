use base64::Engine;
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

const AUDIO_EXT: &[&str] = &[
    "mp3", "flac", "m4a", "ogg", "opus", "wav", "aiff", "wma", "aac",
];

const LOSSLESS_CODECS: &[&str] = &[
    "flac",
    "alac",
    "pcm_s16le",
    "pcm_s16be",
    "pcm_s24le",
    "pcm_s24be",
    "pcm_s32le",
    "pcm_s32be",
    "pcm_f32le",
    "pcm_f64le",
    "wavpack",
];

/// Threshold in dB — if highpass energy is this much below overall, flag as suspect
const TRANSCODE_THRESHOLD_DB: f64 = 50.0;

#[derive(Debug, Clone, Serialize)]
pub struct AudioFileInfo {
    pub file_path: String,
    pub file_name: String,
    pub codec: String,
    pub sample_rate: u32,
    pub bit_depth: Option<u16>,
    pub bitrate: Option<u64>,
    pub channels: u16,
    pub duration: f64,
    pub is_lossless_container: bool,
    pub verdict: String,
    pub verdict_reason: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct QualityScanProgress {
    pub total: usize,
    pub completed: usize,
    pub current_file: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SpectrogramResult {
    pub file_path: String,
    pub image_base64: String,
}

// ── Helpers ──────────────────────────────────────────────────────

fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXT.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn is_lossless_codec(codec: &str) -> bool {
    LOSSLESS_CODECS.contains(&codec.to_lowercase().as_str())
}

fn collect_audio_files(dir: &Path, files: &mut Vec<std::path::PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    let mut dirs = Vec::new();

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.starts_with('.'))
            .unwrap_or(false)
        {
            continue;
        }
        if path.is_dir() {
            dirs.push(path);
        } else if is_audio(&path) {
            files.push(path);
        }
    }

    dirs.sort();
    for d in dirs {
        collect_audio_files(&d, files);
    }
}

fn highpass_cutoff(sample_rate: u32) -> u32 {
    // ~73% of Nyquist — above this is where lossy codecs cut
    ((sample_rate as f64 / 2.0) * 0.73) as u32
}

// ── ffprobe ──────────────────────────────────────────────────────

fn probe_audio_file(path: &Path) -> Result<AudioFileInfo, String> {
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

fn format_sample_rate(rate: u32) -> String {
    if rate % 1000 == 0 {
        format!("{}kHz", rate / 1000)
    } else {
        format!("{:.1}kHz", rate as f64 / 1000.0)
    }
}

// ── Transcode detection ──────────────────────────────────────────

fn detect_transcode(path: &Path, sample_rate: u32) -> Result<bool, String> {
    if sample_rate == 0 {
        return Ok(false);
    }

    let cutoff = highpass_cutoff(sample_rate);
    let path_str = path.to_string_lossy();

    // Measure overall mean volume
    let overall = measure_volume(&path_str, None)?;

    // Measure highpass-filtered mean volume
    let highpass = measure_volume(&path_str, Some(cutoff))?;

    // If highpass energy is drastically below overall, suspect transcode
    // Both values are negative dB (e.g., -25.0 and -80.0)
    let diff = overall - highpass; // e.g., -25.0 - (-80.0) = 55.0
    Ok(diff > TRANSCODE_THRESHOLD_DB)
}

fn measure_volume(path: &str, highpass_freq: Option<u32>) -> Result<f64, String> {
    let mut args = vec!["-i", path, "-af"];
    let filter = match highpass_freq {
        Some(freq) => format!("highpass=f={},volumedetect", freq),
        None => "volumedetect".to_string(),
    };
    args.push(&filter);
    args.extend(["-f", "null", "-"]);

    let output = Command::new("ffmpeg")
        .args(&args)
        .output()
        .map_err(|e| format!("ffmpeg failed: {}", e))?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    parse_mean_volume(&stderr).ok_or_else(|| "Could not parse mean_volume".to_string())
}

fn parse_mean_volume(stderr: &str) -> Option<f64> {
    for line in stderr.lines() {
        if line.contains("mean_volume:") {
            let part = line.split("mean_volume:").nth(1)?;
            let num_str = part.trim().trim_end_matches(" dB").trim();
            return num_str.parse::<f64>().ok();
        }
    }
    None
}

// ── Scan ─────────────────────────────────────────────────────────

pub fn scan_audio_quality(
    path: &str,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
) -> Result<Vec<AudioFileInfo>, String> {
    let root = Path::new(path);
    if !root.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let mut audio_files = Vec::new();
    collect_audio_files(root, &mut audio_files);

    let total = audio_files.len();
    let mut results = Vec::with_capacity(total);

    for (i, file_path) in audio_files.iter().enumerate() {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err("Cancelled".to_string());
        }

        let file_name = file_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let _ = app.emit(
            "quality-scan-progress",
            QualityScanProgress {
                total,
                completed: i,
                current_file: file_name,
            },
        );

        match probe_audio_file(file_path) {
            Ok(info) => results.push(info),
            Err(_) => {
                // Skip files that can't be probed
            }
        }
    }

    Ok(results)
}

// ── Spectrogram ──────────────────────────────────────────────────

pub fn generate_spectrogram(file_path: &str) -> Result<SpectrogramResult, String> {
    let path = Path::new(file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    let output = Command::new("ffmpeg")
        .args([
            "-i",
            file_path,
            "-lavfi",
            "showspectrumpic=s=800x200:legend=0",
            "-frames:v",
            "1",
            "-f",
            "image2pipe",
            "-vcodec",
            "png",
            "pipe:1",
        ])
        .output()
        .map_err(|e| format!("ffmpeg failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "Spectrogram generation failed: {}",
            stderr.lines().last().unwrap_or("unknown error").trim()
        ));
    }

    if output.stdout.is_empty() {
        return Err("ffmpeg produced no output".to_string());
    }

    let encoded = base64::engine::general_purpose::STANDARD.encode(&output.stdout);

    Ok(SpectrogramResult {
        file_path: file_path.to_string(),
        image_base64: encoded,
    })
}

// ── Tests ────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lossless_codec_detection() {
        assert!(is_lossless_codec("flac"));
        assert!(is_lossless_codec("FLAC"));
        assert!(is_lossless_codec("alac"));
        assert!(is_lossless_codec("pcm_s16le"));
        assert!(is_lossless_codec("pcm_s24le"));
        assert!(is_lossless_codec("wavpack"));
        assert!(!is_lossless_codec("mp3"));
        assert!(!is_lossless_codec("aac"));
        assert!(!is_lossless_codec("vorbis"));
        assert!(!is_lossless_codec("opus"));
    }

    #[test]
    fn highpass_cutoff_44100() {
        let cutoff = highpass_cutoff(44100);
        assert!(cutoff > 15000 && cutoff < 17000);
    }

    #[test]
    fn highpass_cutoff_96000() {
        let cutoff = highpass_cutoff(96000);
        assert!(cutoff > 34000 && cutoff < 36000);
    }

    #[test]
    fn parse_mean_volume_valid() {
        let stderr = "[Parsed_volumedetect_0 @ 0x...] n_samples: 123456\n\
                       [Parsed_volumedetect_0 @ 0x...] mean_volume: -25.3 dB\n\
                       [Parsed_volumedetect_0 @ 0x...] max_volume: -1.2 dB\n";
        assert!((parse_mean_volume(stderr).unwrap() - (-25.3)).abs() < 0.01);
    }

    #[test]
    fn parse_mean_volume_missing() {
        assert!(parse_mean_volume("no volume info here").is_none());
        assert!(parse_mean_volume("").is_none());
    }

    #[test]
    fn format_sample_rate_even() {
        assert_eq!(format_sample_rate(44100), "44.1kHz");
        assert_eq!(format_sample_rate(48000), "48kHz");
        assert_eq!(format_sample_rate(96000), "96kHz");
    }

    #[test]
    fn is_audio_recognizes_formats() {
        assert!(is_audio(Path::new("song.flac")));
        assert!(is_audio(Path::new("song.MP3")));
        assert!(!is_audio(Path::new("readme.txt")));
    }
}
