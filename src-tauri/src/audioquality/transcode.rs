use std::path::Path;
use std::process::Command;

use super::{highpass_cutoff, TRANSCODE_THRESHOLD_DB};

pub(super) fn detect_transcode(path: &Path, sample_rate: u32) -> Result<bool, String> {
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

pub(super) fn parse_mean_volume(stderr: &str) -> Option<f64> {
    for line in stderr.lines() {
        if line.contains("mean_volume:") {
            let part = line.split("mean_volume:").nth(1)?;
            let num_str = part.trim().trim_end_matches(" dB").trim();
            return num_str.parse::<f64>().ok();
        }
    }
    None
}

// ── Tests ───────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

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
}
