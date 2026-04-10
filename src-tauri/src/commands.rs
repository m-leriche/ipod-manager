use crate::albumart;
use crate::disk::{self, DiskInfo};
use crate::files::{self, CompareEntry, CopyOperation, CopyResult, FileEntry, SyncCancel};
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn detect_ipod() -> Result<Option<DiskInfo>, String> {
    tauri::async_runtime::spawn_blocking(|| disk::detect_ipod_disk())
        .await
        .map_err(|e| format!("Detection failed: {}", e))?
}

#[tauri::command]
pub async fn mount_ipod(identifier: String, password: String) -> Result<(), String> {
    if !identifier.starts_with("disk") || identifier.contains(' ') || identifier.contains(';') {
        return Err("Invalid disk identifier".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || disk::mount_ipod_disk(&identifier, &password))
        .await
        .map_err(|e| format!("Mount failed: {}", e))?
}

#[tauri::command]
pub async fn unmount_ipod() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| disk::unmount_ipod_disk())
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
pub async fn compare_directories(source: String, target: String) -> Result<Vec<CompareEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || files::compare_dirs(&source, &target))
        .await
        .map_err(|e| format!("Compare failed: {}", e))?
}

#[tauri::command]
pub async fn copy_files(
    operations: Vec<CopyOperation>,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<CopyResult, String> {
    let flag = cancel.flag();
    flag.store(false, std::sync::atomic::Ordering::SeqCst);

    let result = tauri::async_runtime::spawn_blocking(move || {
        files::copy_file_list(operations, app, flag)
    })
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
    let flag = cancel.flag();
    flag.store(false, std::sync::atomic::Ordering::SeqCst);

    let result = tauri::async_runtime::spawn_blocking(move || {
        files::delete_file_list(paths, app, flag)
    })
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
pub async fn scan_album_art(path: String, app: AppHandle) -> Result<Vec<albumart::AlbumInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || albumart::scan_albums(&path, app))
        .await
        .map_err(|e| format!("Scan failed: {}", e))?
}

#[tauri::command]
pub async fn fix_album_art(
    folders: Vec<String>,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<albumart::AlbumArtResult, String> {
    let flag = cancel.flag();
    flag.store(false, std::sync::atomic::Ordering::SeqCst);

    let result = tauri::async_runtime::spawn_blocking(move || {
        albumart::fix_album_art(folders, app, flag)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;

    Ok(result)
}
