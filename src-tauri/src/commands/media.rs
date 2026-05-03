use crate::audioquality;
use crate::convert;
use crate::files::SyncCancel;
use crate::localvideo;
use crate::youtube;
use std::process::Command;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn check_yt_dependencies() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(youtube::check_dependencies)
        .await
        .map_err(|e| format!("Check failed: {}", e))?
}

#[tauri::command]
pub async fn fetch_video_info(url: String) -> Result<youtube::VideoInfo, String> {
    tauri::async_runtime::spawn_blocking(move || youtube::fetch_video_info(&url))
        .await
        .map_err(|e| format!("Fetch failed: {}", e))?
}

#[tauri::command]
pub async fn download_audio(
    url: String,
    output_dir: String,
    format: String,
    chapters: Vec<youtube::Chapter>,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<youtube::DownloadResult, String> {
    let flag = cancel.new_flag();

    let result = tauri::async_runtime::spawn_blocking(move || {
        youtube::download_audio(&url, &output_dir, &format, chapters, app, flag)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;

    Ok(result)
}

#[tauri::command]
pub async fn check_ffmpeg() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(localvideo::check_ffmpeg)
        .await
        .map_err(|e| format!("Check failed: {}", e))?
}

#[tauri::command]
pub async fn probe_video(path: String) -> Result<localvideo::VideoProbe, String> {
    tauri::async_runtime::spawn_blocking(move || localvideo::probe_video(&path))
        .await
        .map_err(|e| format!("Probe failed: {}", e))?
}

#[tauri::command]
pub async fn get_accurate_duration(path: String) -> Result<f64, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let output = Command::new("ffprobe")
            .args([
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_format",
                &path,
            ])
            .output()
            .map_err(|e| format!("ffprobe failed: {}", e))?;

        if !output.status.success() {
            return Err("ffprobe error".to_string());
        }

        let json: serde_json::Value = serde_json::from_slice(&output.stdout)
            .map_err(|e| format!("Failed to parse ffprobe output: {}", e))?;

        json["format"]["duration"]
            .as_str()
            .and_then(|s| s.parse::<f64>().ok())
            .ok_or_else(|| "No duration in ffprobe output".to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn extract_audio_from_video(
    path: String,
    output_dir: String,
    format: String,
    chapters: Vec<youtube::Chapter>,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<youtube::DownloadResult, String> {
    let flag = cancel.new_flag();

    let result = tauri::async_runtime::spawn_blocking(move || {
        localvideo::extract_audio(&path, &output_dir, &format, chapters, app, flag)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;

    Ok(result)
}

#[tauri::command]
pub async fn probe_audio_files(
    paths: Vec<String>,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<Vec<convert::AudioProbeInfo>, String> {
    let flag = cancel.new_flag();

    tauri::async_runtime::spawn_blocking(move || convert::probe_audio_batch(&paths, &app, &flag))
        .await
        .map_err(|e| format!("Probe failed: {}", e))?
}

#[tauri::command]
pub async fn convert_audio(
    requests: Vec<convert::ConvertRequest>,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<convert::ConvertResult, String> {
    let flag = cancel.new_flag();

    tauri::async_runtime::spawn_blocking(move || convert::convert_batch(requests, app, flag))
        .await
        .map_err(|e| format!("Convert failed: {}", e))
}

#[tauri::command]
pub async fn scan_audio_quality(
    path: String,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<Vec<audioquality::AudioFileInfo>, String> {
    let flag = cancel.new_flag();

    tauri::async_runtime::spawn_blocking(move || audioquality::scan_audio_quality(&path, app, flag))
        .await
        .map_err(|e| format!("Scan failed: {}", e))?
}

#[tauri::command]
pub async fn generate_spectrogram(
    file_path: String,
) -> Result<audioquality::SpectrogramResult, String> {
    tauri::async_runtime::spawn_blocking(move || audioquality::generate_spectrogram(&file_path))
        .await
        .map_err(|e| format!("Generation failed: {}", e))?
}

#[tauri::command]
pub async fn generate_waveform(file_path: String) -> Result<audioquality::WaveformResult, String> {
    tauri::async_runtime::spawn_blocking(move || audioquality::generate_waveform(&file_path, 800))
        .await
        .map_err(|e| format!("Generation failed: {}", e))?
}
