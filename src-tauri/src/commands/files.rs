use crate::files::{self, CompareEntry, CopyOperation, CopyResult, FileEntry, SyncCancel};
use crate::profiles::{self, BrowseProfileStore, ProfileStore};
use tauri::{AppHandle, State};

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
