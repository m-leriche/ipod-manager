use crate::disk::{self, DiskInfo};
use crate::files::{self, CompareEntry, CopyOperation, CopyResult, FileEntry};

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
pub fn copy_files(operations: Vec<CopyOperation>) -> Result<CopyResult, String> {
    Ok(files::copy_file_list(&operations))
}

#[tauri::command]
pub fn delete_files(paths: Vec<String>) -> Result<CopyResult, String> {
    Ok(files::delete_file_list(&paths))
}
