use crate::disk::{self, DiskInfo};
use crate::error::AppError;
use crate::ipod_info;
use crate::rockbox;

#[tauri::command]
pub async fn detect_ipod() -> Result<Option<DiskInfo>, AppError> {
    tauri::async_runtime::spawn_blocking(disk::detect_ipod_disk)
        .await
        .map_err(|e| format!("Detection failed: {}", e))?
        .map_err(Into::into)
}

#[tauri::command]
pub async fn mount_ipod(identifier: String, password: String) -> Result<(), AppError> {
    if !identifier.starts_with("disk")
        || identifier.len() <= 4
        || !identifier[4..].chars().all(|c| c.is_ascii_alphanumeric())
    {
        return Err(AppError::InvalidInput("Invalid disk identifier".into()));
    }
    tauri::async_runtime::spawn_blocking(move || disk::mount_ipod_disk(&identifier, &password))
        .await
        .map_err(|e| format!("Mount failed: {}", e))?
        .map_err(Into::into)
}

#[tauri::command]
pub async fn unmount_ipod() -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(disk::unmount_ipod_disk)
        .await
        .map_err(|e| format!("Unmount failed: {}", e))?
        .map_err(Into::into)
}

#[tauri::command]
pub async fn get_ipod_info(
    mount_point: String,
    disk_info: DiskInfo,
) -> Result<ipod_info::IpodInfo, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        ipod_info::read_ipod_info(&mount_point, &disk_info)
    })
    .await
    .map_err(|e| format!("Read failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn read_rockbox_playdata(
    ipod_path: String,
) -> Result<rockbox::RockboxPlayData, AppError> {
    tauri::async_runtime::spawn_blocking(move || rockbox::read_rockbox_playdata(&ipod_path))
        .await
        .map_err(|e| format!("Read failed: {}", e))?
        .map_err(Into::into)
}
