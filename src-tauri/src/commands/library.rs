use crate::error::AppError;
use crate::files::SyncCancel;
use crate::library::{self, LibraryDb};
use crate::libstats;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn scan_library_stats(
    path: String,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<libstats::LibraryStats, AppError> {
    let flag = cancel.new_flag();

    tauri::async_runtime::spawn_blocking(move || libstats::scan_library_stats(&path, app, flag))
        .await
        .map_err(|e| format!("Scan failed: {}", e))?
        .map_err(Into::into)
}

#[tauri::command]
pub async fn get_library_stats(
    db: State<'_, LibraryDb>,
) -> Result<libstats::LibraryStats, AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock error: {}", e))?;
        let location = library::get_library_location(&conn).unwrap_or_default();
        libstats::get_library_stats(&conn, &location)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn check_library_available(db: State<'_, LibraryDb>) -> Result<bool, AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        match library::get_library_location(&conn) {
            Some(loc) => Ok::<_, String>(std::path::Path::new(&loc).exists()),
            None => Ok::<_, String>(false),
        }
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn get_library_location(db: State<'_, LibraryDb>) -> Result<Option<String>, AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        Ok::<_, String>(library::get_library_location(&conn))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn set_library_location(
    path: String,
    app: AppHandle,
    db: State<'_, LibraryDb>,
    cancel: State<'_, SyncCancel>,
) -> Result<(), AppError> {
    let conn_arc = db.conn_arc();
    let flag = cancel.new_flag();

    {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::set_library_location(&conn, &path)?;
    }

    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::scan_folder(&conn, &path, &app, &flag)
    })
    .await
    .map_err(|e| format!("Scan failed: {}", e))??;

    Ok(())
}

#[tauri::command]
pub async fn import_to_library(
    paths: Vec<String>,
    app: AppHandle,
    db: State<'_, LibraryDb>,
    cancel: State<'_, SyncCancel>,
) -> Result<library::ImportResult, AppError> {
    let conn_arc = db.conn_arc();
    let flag = cancel.new_flag();

    let library_root = {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::get_library_location(&conn).ok_or_else(|| {
            AppError::NotFound("No library location configured. Set one in Settings first.".into())
        })?
    };

    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::import_to_library(&library_root, &paths, &conn, &app, &flag)
    })
    .await
    .map_err(|e| format!("Import failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn add_library_folder(
    path: String,
    app: AppHandle,
    db: State<'_, LibraryDb>,
    cancel: State<'_, SyncCancel>,
) -> Result<(), AppError> {
    let flag = cancel.new_flag();
    let conn_arc = db.conn_arc();

    {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::add_folder(&conn, &path)?;
    }

    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::scan_folder(&conn, &path, &app, &flag)
    })
    .await
    .map_err(|e| format!("Scan failed: {}", e))??;

    Ok(())
}

#[tauri::command]
pub async fn delete_library_tracks(
    track_ids: Vec<i64>,
    db: State<'_, LibraryDb>,
) -> Result<usize, AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        let library_root = library::get_library_location(&conn)
            .ok_or_else(|| "No library location set".to_string())?;
        library::delete_tracks(&conn, &library_root, &track_ids)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn flag_tracks(
    track_ids: Vec<i64>,
    flagged: bool,
    db: State<'_, LibraryDb>,
) -> Result<usize, AppError> {
    if track_ids.is_empty() {
        return Ok(0);
    }
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        let placeholders: Vec<String> = (0..track_ids.len())
            .map(|i| format!("?{}", i + 2))
            .collect();
        let sql = format!(
            "UPDATE tracks SET flagged = ?1 WHERE id IN ({})",
            placeholders.join(", ")
        );
        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(flagged)];
        for id in &track_ids {
            params.push(Box::new(*id));
        }
        let refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, refs.as_slice())
            .map_err(|e| format!("Flag update failed: {}", e))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn rate_tracks(
    track_ids: Vec<i64>,
    rating: u8,
    db: State<'_, LibraryDb>,
) -> Result<usize, AppError> {
    if track_ids.is_empty() {
        return Ok(0);
    }
    if rating > 5 {
        return Err(AppError::InvalidInput("Rating must be 0-5".into()));
    }
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        let placeholders: Vec<String> = (0..track_ids.len())
            .map(|i| format!("?{}", i + 2))
            .collect();
        let sql = format!(
            "UPDATE tracks SET rating = ?1 WHERE id IN ({})",
            placeholders.join(", ")
        );
        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(rating as i64)];
        for id in &track_ids {
            params.push(Box::new(*id));
        }
        let refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, refs.as_slice())
            .map_err(|e| format!("Rating update failed: {}", e))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn increment_play_count(track_id: i64, db: State<'_, LibraryDb>) -> Result<(), AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        conn.execute(
            "UPDATE tracks SET play_count = play_count + 1 WHERE id = ?1",
            rusqlite::params![track_id],
        )
        .map_err(|e| format!("Play count update failed: {}", e))?;
        Ok::<_, String>(())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn remove_library_folder(path: String, db: State<'_, LibraryDb>) -> Result<(), AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::remove_folder(&conn, &path)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn get_library_folders(
    db: State<'_, LibraryDb>,
) -> Result<Vec<library::LibraryFolder>, AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::get_folders(&conn)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn refresh_library(
    app: AppHandle,
    db: State<'_, LibraryDb>,
    cancel: State<'_, SyncCancel>,
) -> Result<(), AppError> {
    let flag = cancel.new_flag();
    let conn_arc = db.conn_arc();

    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::rescan_all_folders(&conn, &app, &flag)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn get_library_tracks(
    filter: library::LibraryFilter,
    db: State<'_, LibraryDb>,
) -> Result<Vec<library::LibraryTrack>, AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::get_tracks(&conn, &filter)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn get_library_browser_data(
    filter: library::LibraryFilter,
    db: State<'_, LibraryDb>,
) -> Result<library::BrowserData, AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::get_browser_data(&conn, &filter)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn get_library_artists(
    db: State<'_, LibraryDb>,
) -> Result<Vec<library::ArtistSummary>, AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::get_artists(&conn)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn get_library_albums(
    artist: Option<String>,
    db: State<'_, LibraryDb>,
) -> Result<Vec<library::AlbumSummary>, AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::get_albums(&conn, artist.as_deref())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn get_library_genres(
    db: State<'_, LibraryDb>,
) -> Result<Vec<library::GenreSummary>, AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::get_genres(&conn)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn search_library(
    query: String,
    db: State<'_, LibraryDb>,
) -> Result<Vec<library::LibraryTrack>, AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::search_tracks(&conn, &query)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn detect_duplicates(
    app: AppHandle,
    db: State<'_, LibraryDb>,
    cancel: State<'_, SyncCancel>,
) -> Result<library::duplicates::DuplicateDetectionResult, AppError> {
    let flag = cancel.new_flag();
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::duplicates::detect_duplicates(&conn, &app, &flag)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn delete_duplicate_tracks(
    track_ids: Vec<i64>,
    db: State<'_, LibraryDb>,
) -> Result<usize, AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        let library_root = library::get_library_location(&conn)
            .ok_or_else(|| "No library location set".to_string())?;
        library::delete_tracks(&conn, &library_root, &track_ids)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}
