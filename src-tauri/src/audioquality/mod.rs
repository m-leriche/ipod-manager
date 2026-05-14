mod probe;
mod scan;
mod spectrogram;
mod transcode;
mod waveform;

pub use scan::{scan_audio_quality, scan_audio_quality_paths};
pub use spectrogram::generate_spectrogram;
pub use waveform::{generate_waveform, WaveformResult};

use serde::Serialize;

// ── Constants ───────────────────────────────────────────────────

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

// ── Types ───────────────────────────────────────────────────────

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

// ── Helpers ─────────────────────────────────────────────────────

fn is_lossless_codec(codec: &str) -> bool {
    LOSSLESS_CODECS.contains(&codec.to_lowercase().as_str())
}

fn highpass_cutoff(sample_rate: u32) -> u32 {
    // ~73% of Nyquist — above this is where lossy codecs cut
    ((sample_rate as f64 / 2.0) * 0.73) as u32
}

fn format_sample_rate(rate: u32) -> String {
    if rate % 1000 == 0 {
        format!("{}kHz", rate / 1000)
    } else {
        format!("{:.1}kHz", rate as f64 / 1000.0)
    }
}

// ── Tests ───────────────────────────────────────────────────────

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
    fn format_sample_rate_even() {
        assert_eq!(format_sample_rate(44100), "44.1kHz");
        assert_eq!(format_sample_rate(48000), "48kHz");
        assert_eq!(format_sample_rate(96000), "96kHz");
    }
}
