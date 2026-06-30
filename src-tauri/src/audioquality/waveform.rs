use std::path::Path;
use std::process::Command;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct WaveformResult {
    pub file_path: String,
    pub peaks: Vec<[f32; 2]>,
    pub duration: f64,
}

fn get_duration(file_path: &str) -> Result<f64, String> {
    let output = Command::new("ffprobe")
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            // `--` ends option parsing so a path beginning with `-` is treated
            // as a filename, not an ffprobe flag.
            "--",
            file_path,
        ])
        .output()
        .map_err(|e| format!("ffprobe failed: {}", e))?;

    if !output.status.success() {
        return Err("ffprobe error".to_string());
    }

    let json: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("Parse error: {}", e))?;

    json["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .ok_or_else(|| "Could not read duration".to_string())
}

fn compute_peaks(samples: &[f32], num_peaks: usize) -> Vec<[f32; 2]> {
    if samples.is_empty() || num_peaks == 0 {
        return vec![[0.0, 0.0]; num_peaks];
    }

    let chunk_size = samples.len() as f64 / num_peaks as f64;
    (0..num_peaks)
        .map(|i| {
            let start = (i as f64 * chunk_size) as usize;
            let end = (((i + 1) as f64 * chunk_size) as usize).min(samples.len());
            let slice = &samples[start..end];
            if slice.is_empty() {
                [0.0, 0.0]
            } else {
                let min = slice.iter().copied().fold(f32::INFINITY, f32::min);
                let max = slice.iter().copied().fold(f32::NEG_INFINITY, f32::max);
                [min, max]
            }
        })
        .collect()
}

pub fn generate_waveform(file_path: &str, num_peaks: usize) -> Result<WaveformResult, String> {
    let path = Path::new(file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    let duration = get_duration(file_path)?;

    let output = Command::new("ffmpeg")
        .args([
            "-i",
            file_path,
            "-ar",
            "8000",
            "-ac",
            "1",
            "-f",
            "f32le",
            "-acodec",
            "pcm_f32le",
            "pipe:1",
        ])
        .output()
        .map_err(|e| format!("ffmpeg failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "Waveform generation failed: {}",
            stderr.lines().last().unwrap_or("unknown error").trim()
        ));
    }

    if output.stdout.is_empty() {
        return Err("ffmpeg produced no audio data".to_string());
    }

    let samples: Vec<f32> = output
        .stdout
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect();

    let peaks = compute_peaks(&samples, num_peaks);

    Ok(WaveformResult {
        file_path: file_path.to_string(),
        peaks,
        duration,
    })
}

// ── Tests ───────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compute_peaks_basic() {
        let samples = vec![-0.5, 0.8, -0.3, 0.6, -0.9, 0.2, -0.1, 0.4];
        let peaks = compute_peaks(&samples, 2);
        assert_eq!(peaks.len(), 2);
        // First bucket: [-0.5, 0.8, -0.3, 0.6]
        assert!((peaks[0][0] - (-0.5)).abs() < 0.001);
        assert!((peaks[0][1] - 0.8).abs() < 0.001);
        // Second bucket: [-0.9, 0.2, -0.1, 0.4]
        assert!((peaks[1][0] - (-0.9)).abs() < 0.001);
        assert!((peaks[1][1] - 0.4).abs() < 0.001);
    }

    #[test]
    fn compute_peaks_empty() {
        let peaks = compute_peaks(&[], 4);
        assert_eq!(peaks.len(), 4);
        assert_eq!(peaks[0], [0.0, 0.0]);
    }

    #[test]
    fn compute_peaks_single_bucket() {
        let samples = vec![-1.0, 0.5, 0.0, -0.3];
        let peaks = compute_peaks(&samples, 1);
        assert_eq!(peaks.len(), 1);
        assert!((peaks[0][0] - (-1.0)).abs() < 0.001);
        assert!((peaks[0][1] - 0.5).abs() < 0.001);
    }
}
