use crate::error::AppError;
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
    {
        let conn = db.lock_conn()?;
        library::set_setting(&conn, inbox::INBOX_LOCATION_KEY, &path)?;
    }
    watcher.watch(Some(PathBuf::from(path)), app)?;
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
) -> Result<inbox::CheckResult, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        inbox::verify_tracklist(&artist, &album, track_count)
    })
    .await
    .map_err(|e| AppError::Generic(format!("Task failed: {}", e)))
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
