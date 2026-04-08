use crate::disk::{self, DiskInfo};
use crate::files::{self, CompareEntry, CopyOperation, CopyResult, FileEntry, SyncCancel};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn detect_ipod() -> Result<Option<DiskInfo>, String> {
    disk::detect_ipod_disk()
}

#[tauri::command]
pub fn mount_ipod(identifier: String, password: String) -> Result<(), String> {
    if !identifier.starts_with("disk") || identifier.contains(' ') || identifier.contains(';') {
        return Err("Invalid disk identifier".to_string());
    }
    disk::mount_ipod_disk(&identifier, &password)
}

#[tauri::command]
pub fn unmount_ipod() -> Result<(), String> {
    disk::unmount_ipod_disk()
}

#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    files::list_dir(&path)
}

#[tauri::command]
pub fn compare_directories(source: String, target: String) -> Result<Vec<CompareEntry>, String> {
    files::compare_dirs(&source, &target)
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
