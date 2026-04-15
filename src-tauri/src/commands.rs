use crate::albumart;
use crate::audioquality;
use crate::disk::{self, DiskInfo};
use crate::files::{self, CompareEntry, CopyOperation, CopyResult, FileEntry, SyncCancel};
use crate::libstats;
use crate::localvideo;
use crate::metadata;
use crate::metarepair;
use crate::profiles::{self, BrowseProfileStore, ProfileStore};
use crate::rockbox;
use crate::sanitize;
use crate::youtube;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn detect_ipod() -> Result<Option<DiskInfo>, String> {
    tauri::async_runtime::spawn_blocking(disk::detect_ipod_disk)
        .await
        .map_err(|e| format!("Detection failed: {}", e))?
}

#[tauri::command]
pub async fn mount_ipod(identifier: String, password: String) -> Result<(), String> {
    if !identifier.starts_with("disk")
        || identifier.len() <= 4
        || !identifier[4..].chars().all(|c| c.is_ascii_alphanumeric())
    {
        return Err("Invalid disk identifier".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || disk::mount_ipod_disk(&identifier, &password))
        .await
        .map_err(|e| format!("Mount failed: {}", e))?
}

#[tauri::command]
pub async fn unmount_ipod() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(disk::unmount_ipod_disk)
        .await
        .map_err(|e| format!("Unmount failed: {}", e))?
}

#[tauri::command]
pub async fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || files::list_dir(&path))
        .await
        .map_err(|e| format!("List failed: {}", e))?
}

#[tauri::command]
pub async fn compare_directories(
    source: String,
    target: String,
    exclusions: Option<Vec<String>>,
    cancel: State<'_, SyncCancel>,
) -> Result<Vec<CompareEntry>, String> {
    let flag = cancel.new_flag();

    tauri::async_runtime::spawn_blocking(move || {
        let mut entries = files::compare_dirs(&source, &target, flag)?;
        if let Some(ref ex) = exclusions {
            if !ex.is_empty() {
                entries.retain(|e| !profiles::is_excluded(&e.relative_path, ex));
            }
        }
        Ok(entries)
    })
    .await
    .map_err(|e| format!("Compare failed: {}", e))?
}

#[tauri::command]
pub async fn copy_files(
    operations: Vec<CopyOperation>,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<CopyResult, String> {
    let flag = cancel.new_flag();

    let result =
        tauri::async_runtime::spawn_blocking(move || files::copy_file_list(operations, app, flag))
            .await
            .map_err(|e| format!("Task failed: {}", e))?;

    Ok(result)
}

#[tauri::command]
pub async fn delete_files(
    paths: Vec<String>,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<CopyResult, String> {
    let flag = cancel.new_flag();

    let result =
        tauri::async_runtime::spawn_blocking(move || files::delete_file_list(paths, app, flag))
            .await
            .map_err(|e| format!("Task failed: {}", e))?;

    Ok(result)
}

#[tauri::command]
pub fn cancel_sync(cancel: State<'_, SyncCancel>) -> Result<(), String> {
    cancel.cancel();
    Ok(())
}

#[tauri::command]
pub async fn scan_album_art(
    path: String,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<Vec<albumart::AlbumInfo>, String> {
    let flag = cancel.new_flag();

    tauri::async_runtime::spawn_blocking(move || albumart::scan_albums(&path, app, flag))
        .await
        .map_err(|e| format!("Scan failed: {}", e))?
}

#[tauri::command]
pub async fn fix_album_art(
    folders: Vec<String>,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<albumart::AlbumArtResult, String> {
    let flag = cancel.new_flag();

    let result =
        tauri::async_runtime::spawn_blocking(move || albumart::fix_album_art(folders, app, flag))
            .await
            .map_err(|e| format!("Task failed: {}", e))?;

    Ok(result)
}

#[tauri::command]
pub async fn delete_entry(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = std::path::Path::new(&path);
        if !p.exists() {
            return Err(format!("Path does not exist: {}", path));
        }
        if p.is_dir() {
            std::fs::remove_dir_all(p)
        } else {
            std::fs::remove_file(p)
        }
        .map_err(|e| format!("Delete failed: {}", e))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn rename_entry(old_path: String, new_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || files::rename_entry(&old_path, &new_path))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn create_folder(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || files::create_folder(&path))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn move_files(
    operations: Vec<CopyOperation>,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<CopyResult, String> {
    let flag = cancel.new_flag();

    let result =
        tauri::async_runtime::spawn_blocking(move || files::move_file_list(operations, app, flag))
            .await
            .map_err(|e| format!("Task failed: {}", e))?;

    Ok(result)
}

#[tauri::command]
pub fn get_profiles(app: AppHandle) -> Result<ProfileStore, String> {
    profiles::load_profiles(&app)
}

#[tauri::command]
pub fn save_profiles(store: ProfileStore, app: AppHandle) -> Result<(), String> {
    profiles::save_profiles(&app, &store)
}

#[tauri::command]
pub fn get_browse_profiles(app: AppHandle) -> Result<BrowseProfileStore, String> {
    profiles::load_browse_profiles(&app)
}

#[tauri::command]
pub fn save_browse_profiles(store: BrowseProfileStore, app: AppHandle) -> Result<(), String> {
    profiles::save_browse_profiles(&app, &store)
}

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
pub async fn scan_metadata_paths(
    paths: Vec<String>,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<Vec<metadata::TrackMetadata>, String> {
    let flag = cancel.new_flag();

    tauri::async_runtime::spawn_blocking(move || metadata::scan_metadata_paths(paths, app, flag))
        .await
        .map_err(|e| format!("Scan failed: {}", e))?
}

#[tauri::command]
pub async fn scan_metadata(
    path: String,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<Vec<metadata::TrackMetadata>, String> {
    let flag = cancel.new_flag();

    tauri::async_runtime::spawn_blocking(move || metadata::scan_metadata(&path, app, flag))
        .await
        .map_err(|e| format!("Scan failed: {}", e))?
}

#[tauri::command]
pub async fn save_metadata(
    updates: Vec<metadata::MetadataUpdate>,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<metadata::MetadataSaveResult, String> {
    let flag = cancel.new_flag();

    tauri::async_runtime::spawn_blocking(move || Ok(metadata::save_metadata(updates, app, flag)))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn repair_analyze(
    tracks: Vec<metadata::TrackMetadata>,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<metarepair::RepairReport, String> {
    let flag = cancel.new_flag();

    tauri::async_runtime::spawn_blocking(move || metarepair::lookup_and_compare(tracks, app, flag))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn repair_compare_release(
    tracks: Vec<metadata::TrackMetadata>,
    mbid: String,
    app: AppHandle,
) -> Result<metarepair::AlbumRepairReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _ = &app; // keep app alive for the task duration
        metarepair::compare_against_release(tracks, &mbid)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn sanitize_tags(
    options: sanitize::SanitizeOptions,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<sanitize::SanitizeResult, String> {
    let flag = cancel.new_flag();

    let result =
        tauri::async_runtime::spawn_blocking(move || sanitize::sanitize_tags(options, app, flag))
            .await
            .map_err(|e| format!("Task failed: {}", e))?;

    Ok(result)
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

#[tauri::command]
pub async fn scan_library_stats(
    path: String,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<libstats::LibraryStats, String> {
    let flag = cancel.new_flag();

    tauri::async_runtime::spawn_blocking(move || libstats::scan_library_stats(&path, app, flag))
        .await
        .map_err(|e| format!("Scan failed: {}", e))?
}

#[tauri::command]
pub async fn read_rockbox_playdata(ipod_path: String) -> Result<rockbox::RockboxPlayData, String> {
    tauri::async_runtime::spawn_blocking(move || rockbox::read_rockbox_playdata(&ipod_path))
        .await
        .map_err(|e| format!("Read failed: {}", e))?
}
