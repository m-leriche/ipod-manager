use crate::error::AppError;
use crate::files::SyncCancel;
use crate::library::{self, LibraryDb};
use crate::libstats;
use crate::subsonic::SubsonicCacheHandle;
use crate::watcher;
use tauri::{AppHandle, Emitter, Manager, State};

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
    db.with_db(move |conn| {
        let location = library::get_library_location(conn).unwrap_or_default();
        libstats::get_library_stats(conn, &location)
    })
    .await
}

#[tauri::command]
pub async fn set_library_location(
    path: String,
    app: AppHandle,
    db: State<'_, LibraryDb>,
    cancel: State<'_, SyncCancel>,
    cache: State<'_, SubsonicCacheHandle>,
) -> Result<(), AppError> {
    let conn_arc = db.conn_arc();
    let flag = cancel.new_flag();

    {
        let conn = db.lock_conn()?;
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

    cache.invalidate();
    Ok(())
}

#[tauri::command]
pub async fn import_to_library(
    paths: Vec<String>,
    app: AppHandle,
    db: State<'_, LibraryDb>,
    cancel: State<'_, SyncCancel>,
    cache: State<'_, SubsonicCacheHandle>,
) -> Result<library::ImportResult, AppError> {
    let conn_arc = db.conn_arc();
    let flag = cancel.new_flag();

    let library_root = {
        let conn = db.lock_conn()?;
        library::get_library_location(&conn).ok_or_else(|| {
            AppError::NotFound("No library location configured. Set one in Settings first.".into())
        })?
    };

    let result = tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::import_to_library(&library_root, &paths, &conn, &app, &flag)
    })
    .await
    .map_err(|e| format!("Import failed: {}", e))?
    // AppError::Generic is equivalent to Into::into here (From<String> → AppError::Generic),
    // but explicit because Rust can't infer the target type with multiple From impls.
    .map_err(AppError::Generic)?;

    cache.invalidate();
    Ok(result)
}

#[tauri::command]
pub async fn add_library_folder(
    path: String,
    app: AppHandle,
    db: State<'_, LibraryDb>,
    cancel: State<'_, SyncCancel>,
    cache: State<'_, SubsonicCacheHandle>,
) -> Result<(), AppError> {
    let flag = cancel.new_flag();
    let conn_arc = db.conn_arc();

    {
        let conn = db.lock_conn()?;
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

    cache.invalidate();
    Ok(())
}

#[tauri::command]
pub async fn refresh_library(
    app: AppHandle,
    db: State<'_, LibraryDb>,
    cancel: State<'_, SyncCancel>,
    cache: State<'_, SubsonicCacheHandle>,
) -> Result<(), AppError> {
    auto_backup(&app, &db).await;
    let flag = cancel.new_flag();
    db.with_db(move |conn| library::rescan_all_folders(conn, &app, &flag))
        .await?;
    cache.invalidate();
    Ok(())
}

#[tauri::command]
pub async fn background_rescan(
    app: AppHandle,
    db: State<'_, LibraryDb>,
    cancel: State<'_, SyncCancel>,
    cache: State<'_, SubsonicCacheHandle>,
) -> Result<library::BackgroundScanResult, AppError> {
    auto_backup(&app, &db).await;
    let flag = cancel.new_flag();
    let result = db
        .with_db(move |conn| library::background_rescan_all_folders(conn, &flag))
        .await?;

    if result.changed > 0 || result.removed > 0 {
        let _ = app.emit(
            "library-changed",
            watcher::LibraryChangeEvent {
                added: result.changed,
                removed: result.removed,
            },
        );
        cache.invalidate();
    }

    Ok(result)
}

#[tauri::command]
pub async fn check_library_available(db: State<'_, LibraryDb>) -> Result<bool, AppError> {
    db.with_db(move |conn| match library::get_library_location(conn) {
        Some(loc) => Ok::<_, String>(std::path::Path::new(&loc).exists()),
        None => Ok::<_, String>(false),
    })
    .await
}

#[tauri::command]
pub async fn get_library_location(db: State<'_, LibraryDb>) -> Result<Option<String>, AppError> {
    db.with_db(|conn| Ok::<_, String>(library::get_library_location(conn)))
        .await
}

#[tauri::command]
pub async fn remove_library_folder(
    path: String,
    db: State<'_, LibraryDb>,
    cache: State<'_, SubsonicCacheHandle>,
) -> Result<(), AppError> {
    db.with_db(move |conn| library::remove_folder(conn, &path))
        .await?;
    cache.invalidate();
    Ok(())
}

#[tauri::command]
pub async fn get_library_folders(
    db: State<'_, LibraryDb>,
) -> Result<Vec<library::LibraryFolder>, AppError> {
    db.with_db(library::get_folders).await
}

/// Best-effort automatic backup before destructive operations.
/// Runs on a blocking thread to avoid stalling the Tokio runtime.
/// Failures are logged but never block the caller.
async fn auto_backup(app: &AppHandle, db: &State<'_, LibraryDb>) {
    let db_path = match app.path().app_data_dir() {
        Ok(dir) => dir.join("library.db"),
        Err(_) => return,
    };
    let conn_arc = db.conn_arc();
    let _ = tauri::async_runtime::spawn_blocking(move || {
        let conn = match conn_arc.lock() {
            Ok(c) => c,
            Err(_) => return,
        };
        match library::backup::create_backup(&conn, &db_path) {
            Ok(info) => log::info!("Auto-backup created: {}", info.path),
            Err(e) => log::warn!("Auto-backup failed (non-fatal): {}", e),
        }
    })
    .await;
}
