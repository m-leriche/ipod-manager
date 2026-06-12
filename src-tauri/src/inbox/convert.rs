use std::fs;
use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::AppHandle;

use crate::convert::{self, ConvertRequest, ConvertResult};

use super::filing::move_file;
use super::scan::direct_audio_children;

const TEMP_DIR: &str = ".crate-convert";

/// Convert an inbox album's audio files in place: convert into a hidden temp
/// dir (invisible to the scanner and watcher), then replace the originals.
/// Originals are kept untouched on cancel or per-file failure.
pub fn convert_album(
    folder: &str,
    target_format: &str,
    sample_rate: Option<u32>,
    bit_depth: Option<u16>,
    mp3_bitrate: Option<u32>,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
) -> Result<ConvertResult, String> {
    let folder = Path::new(folder);
    let audio = direct_audio_children(folder);
    if audio.is_empty() {
        return Err(format!("No audio files in {}", folder.display()));
    }

    let tmp_dir = folder.join(TEMP_DIR);
    let requests: Vec<ConvertRequest> = audio
        .iter()
        .map(|p| ConvertRequest {
            input_path: p.to_string_lossy().to_string(),
            output_dir: tmp_dir.to_string_lossy().to_string(),
            target_format: target_format.to_string(),
            mp3_bitrate,
            flac_sample_rate: sample_rate,
            flac_bit_depth: bit_depth,
        })
        .collect();

    let mut result = convert::convert_batch(requests, app, cancel_flag);

    if result.cancelled {
        let _ = fs::remove_dir_all(&tmp_dir);
        return Ok(result);
    }

    for pair in result.pairs.clone() {
        let input = Path::new(&pair.input_path);
        let output = Path::new(&pair.output_path);
        let Some(file_name) = output.file_name() else {
            continue;
        };
        if let Err(e) = fs::remove_file(input) {
            result.errors.push(format!(
                "{}: failed to replace original: {}",
                input.display(),
                e
            ));
            continue;
        }
        if let Err(e) = move_file(output, &folder.join(file_name)) {
            result
                .errors
                .push(format!("{}: {}", file_name.to_string_lossy(), e));
        }
    }
    let _ = fs::remove_dir_all(&tmp_dir);

    Ok(result)
}
