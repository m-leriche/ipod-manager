mod converter;
mod helpers;
mod probe;

use serde::{Deserialize, Serialize};

pub use converter::convert_batch;
pub use probe::probe_audio_batch;

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
pub struct ConvertedPair {
    pub input_path: String,
    pub output_path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConvertResult {
    pub success: bool,
    pub cancelled: bool,
    pub converted: usize,
    pub failed: usize,
    pub errors: Vec<String>,
    pub output_paths: Vec<String>,
    /// Explicit input → output mapping. The output file name can differ from
    /// the input stem (sanitization, collision suffixes), so callers must not
    /// reverse-engineer it.
    pub pairs: Vec<ConvertedPair>,
    pub warnings: Vec<String>,
}
