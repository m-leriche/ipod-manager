use std::path::Path;
use std::process::Command;

use base64::Engine;

use super::SpectrogramResult;

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
