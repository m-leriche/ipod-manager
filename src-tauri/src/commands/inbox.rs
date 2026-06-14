use crate::convert::ConvertResult;
use crate::error::AppError;
use crate::files::SyncCancel;
use crate::inbox::{self, InboxWatcher};
use crate::library::{self, LibraryDb};
use crate::watcher::LibraryChangeEvent;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub async fn get_inbox_location(db: State<'_, LibraryDb>) -> Result<Option<String>, AppError> {
    db.with_db(|conn| Ok::<_, String>(library::get_setting(conn, inbox::INBOX_LOCATION_KEY)))
        .await
}

#[tauri::command]
pub async fn set_inbox_location(
    path: String,
    app: AppHandle,
    db: State<'_, LibraryDb>,
    watcher: State<'_, InboxWatcher>,
) -> Result<(), AppError> {
    if !std::path::Path::new(&path).is_dir() {
        return Err(AppError::InvalidInput(format!("Not a folder: {}", path)));
    }
    // Watch first — if it fails, the setting keeps its old value and the UI
    // stays consistent with the DB.
    watcher.watch(Some(PathBuf::from(&path)), app)?;
    let conn = db.lock_conn()?;
    library::set_setting(&conn, inbox::INBOX_LOCATION_KEY, &path)?;
    Ok(())
}

#[tauri::command]
pub async fn scan_inbox(db: State<'_, LibraryDb>) -> Result<Vec<inbox::InboxAlbum>, AppError> {
    let location = {
        let conn = db.lock_conn()?;
        library::get_setting(&conn, inbox::INBOX_LOCATION_KEY)
    }
    .ok_or_else(|| AppError::NotFound("No inbox folder configured".into()))?;

    db.with_db(move |conn| inbox::scan_inbox(&location, conn))
        .await
}

#[tauri::command]
pub async fn verify_inbox_tracklist(
    artist: String,
    album: String,
    track_count: usize,
    db: State<'_, LibraryDb>,
) -> Result<inbox::CheckResult, AppError> {
    // Network lookup runs without holding the DB lock; the verdict is cached
    // afterwards so unchanged albums skip verification on future scans.
    let (artist2, album2) = (artist.clone(), album.clone());
    let result = tauri::async_runtime::spawn_blocking(move || {
        inbox::verify_tracklist(&artist, &album, track_count)
    })
    .await
    .map_err(|e| AppError::Generic(format!("Task failed: {}", e)))?;

    {
        let conn = db.lock_conn()?;
        inbox::cache_tracklist(&conn, &artist2, &album2, track_count, &result);
    }
    Ok(result)
}

#[tauri::command]
pub async fn convert_inbox_album(
    folder_path: String,
    target_format: String,
    sample_rate: Option<u32>,
    bit_depth: Option<u16>,
    mp3_bitrate: Option<u32>,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<ConvertResult, AppError> {
    if !["flac", "mp3"].contains(&target_format.as_str()) {
        return Err(AppError::InvalidInput(format!(
            "Unsupported target format: {}",
            target_format
        )));
    }
    let flag = cancel.new_flag();

    tauri::async_runtime::spawn_blocking(move || {
        inbox::convert_album(
            &folder_path,
            &target_format,
            sample_rate,
            bit_depth,
            mp3_bitrate,
            app,
            flag,
        )
    })
    .await
    .map_err(|e| format!("Convert failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn file_inbox_album(
    folder_path: String,
    app: AppHandle,
    db: State<'_, LibraryDb>,
) -> Result<inbox::FileAwayResult, AppError> {
    let library_root = {
        let conn = db.lock_conn()?;
        library::get_library_location(&conn)
    }
    .ok_or_else(|| {
        AppError::NotFound("No library location configured. Set one in Settings first.".into())
    })?;

    let result = db
        .with_db(move |conn| inbox::file_album(&library_root, &folder_path, conn))
        .await?;

    let added = result.moves.iter().filter(|m| m.is_audio).count();
    if added > 0 {
        let _ = app.emit("library-changed", LibraryChangeEvent { added, removed: 0 });
    }
    Ok(result)
}

#[tauri::command]
pub async fn delete_inbox_folders(folder_paths: Vec<String>) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        for folder in folder_paths {
            inbox::delete_filed_folder(&folder);
        }
    })
    .await
    .map_err(|e| AppError::Generic(format!("Folder cleanup failed: {}", e)))?;
    Ok(())
}

#[tauri::command]
pub async fn undo_inbox_filing(
    moves: Vec<inbox::FileMove>,
    app: AppHandle,
    db: State<'_, LibraryDb>,
) -> Result<(), AppError> {
    let removed = moves.iter().filter(|m| m.is_audio).count();
    db.with_db(move |conn| inbox::undo_filing(&moves, conn))
        .await?;

    if removed > 0 {
        let _ = app.emit("library-changed", LibraryChangeEvent { added: 0, removed });
    }
    Ok(())
}
