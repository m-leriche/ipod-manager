use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

use super::probe::probe_audio_file;
use super::{AudioFileInfo, QualityScanProgress};
use crate::audio_utils::collect_audio_files;

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
