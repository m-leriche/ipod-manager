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
pub async fn mount_ipod(
    identifier: String,
    password: String,
    mount_point: Option<String>,
) -> Result<String, AppError> {
    if !identifier.starts_with("disk")
        || identifier.len() <= 4
        || !identifier[4..].chars().all(|c| c.is_ascii_alphanumeric())
    {
        return Err(AppError::InvalidInput("Invalid disk identifier".into()));
    }
    let mount_path = mount_point.unwrap_or_else(|| disk::DEFAULT_MOUNT_POINT.to_string());
    validate_mount_point(&mount_path)?;
    let mp = mount_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        disk::mount_ipod_disk(&identifier, &password, &mp)
    })
    .await
    .map_err(|e| AppError::Generic(format!("Mount failed: {}", e)))?
    .map_err(AppError::Generic)?;
    Ok(mount_path)
}

#[tauri::command]
pub async fn unmount_ipod(mount_point: Option<String>) -> Result<(), AppError> {
    let mp = mount_point.unwrap_or_else(|| disk::DEFAULT_MOUNT_POINT.to_string());
    validate_mount_point(&mp)?;
    tauri::async_runtime::spawn_blocking(move || disk::unmount_ipod_disk(&mp))
        .await
        .map_err(|e| AppError::Generic(format!("Unmount failed: {}", e)))?
        .map_err(AppError::Generic)
}

/// Ensure the mount point is under /Volumes/ to prevent sudo from
/// creating or unmounting arbitrary paths.
fn validate_mount_point(path: &str) -> Result<(), AppError> {
    if !path.starts_with("/Volumes/") || path.contains("..") {
        return Err(AppError::InvalidInput(
            "Mount point must be under /Volumes/".into(),
        ));
    }
    Ok(())
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

#[tauri::command]
pub async fn write_rockbox_playdata(
    ipod_path: String,
    updates: Vec<rockbox::RockboxTrackUpdate>,
) -> Result<rockbox::WriteResult, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        rockbox::write_rockbox_playdata(&ipod_path, &updates)
    })
    .await
    .map_err(|e| format!("Write failed: {}", e))?
    .map_err(Into::into)
}
