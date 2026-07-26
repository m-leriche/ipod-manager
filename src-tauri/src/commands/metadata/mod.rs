mod save;

pub use save::*;

use crate::albumart;
use crate::error::AppError;
use crate::files::{ArtRepairCancel, SyncCancel};
use crate::library::{self, LibraryDb};
use crate::metadata;
use crate::metarepair;
use crate::musicbrainz::MbCache;
use crate::sanitize;
use rusqlite::params;
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager, State};

#[tauri::command]
pub async fn scan_album_art(
    path: String,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<Vec<albumart::AlbumInfo>, AppError> {
    let flag = cancel.new_flag();

    tauri::async_runtime::spawn_blocking(move || albumart::scan_albums(&path, app, flag))
        .await
        .map_err(|e| format!("Scan failed: {}", e))?
        .map_err(Into::into)
}

#[tauri::command]
pub async fn fix_album_art(
    folders: Vec<String>,
    app: AppHandle,
    db: State<'_, LibraryDb>,
    cancel: State<'_, SyncCancel>,
) -> Result<albumart::AlbumArtResult, AppError> {
    let flag = cancel.new_flag();
    let cache = MbCache::new(db.conn_arc());

    let result = tauri::async_runtime::spawn_blocking(move || {
        albumart::fix_album_art(folders, app, flag, "albumart-progress", &cache)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;

    Ok(result)
}

#[tauri::command]
pub async fn scan_metadata_paths(
    paths: Vec<String>,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<Vec<metadata::TrackMetadata>, AppError> {
    let flag = cancel.new_flag();

    tauri::async_runtime::spawn_blocking(move || metadata::scan_metadata_paths(paths, app, flag))
        .await
        .map_err(|e| format!("Scan failed: {}", e))?
        .map_err(Into::into)
}

#[tauri::command]
pub async fn scan_metadata(
    path: String,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<Vec<metadata::TrackMetadata>, AppError> {
    let flag = cancel.new_flag();

    tauri::async_runtime::spawn_blocking(move || metadata::scan_metadata(&path, app, flag))
        .await
        .map_err(|e| format!("Scan failed: {}", e))?
        .map_err(Into::into)
}

#[tauri::command]
pub async fn get_id3_version(db: State<'_, LibraryDb>) -> Result<String, AppError> {
    db.with_db(|conn| {
        Ok::<_, String>(
            metadata::Id3WriteVersion::from_setting(
                library::get_setting(conn, metadata::Id3WriteVersion::SETTING_KEY).as_deref(),
            )
            .as_setting()
            .to_string(),
        )
    })
    .await
}

#[tauri::command]
pub async fn set_id3_version(version: String, db: State<'_, LibraryDb>) -> Result<(), AppError> {
    if version != "v2.3" && version != "v2.4" {
        return Err(AppError::InvalidInput(format!(
            "Invalid ID3 version: {version}"
        )));
    }
    db.with_db(move |conn| {
        library::set_setting(conn, metadata::Id3WriteVersion::SETTING_KEY, &version)
    })
    .await
}

#[tauri::command]
pub async fn repair_analyze(
    tracks: Vec<metadata::TrackMetadata>,
    app: AppHandle,
    db: State<'_, LibraryDb>,
    cancel: State<'_, SyncCancel>,
) -> Result<metarepair::RepairReport, AppError> {
    let flag = cancel.new_flag();
    let cache = MbCache::new(db.conn_arc());

    tauri::async_runtime::spawn_blocking(move || {
        metarepair::lookup_and_compare(tracks, app, flag, &cache)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn repair_compare_release(
    tracks: Vec<metadata::TrackMetadata>,
    mbid: String,
    app: AppHandle,
    db: State<'_, LibraryDb>,
) -> Result<metarepair::AlbumRepairReport, AppError> {
    let cache = MbCache::new(db.conn_arc());

    tauri::async_runtime::spawn_blocking(move || {
        let _ = &app;
        metarepair::compare_against_release(tracks, &mbid, &cache)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn sanitize_tags(
    options: sanitize::SanitizeOptions,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<sanitize::SanitizeResult, AppError> {
    let flag = cancel.new_flag();

    let result =
        tauri::async_runtime::spawn_blocking(move || sanitize::sanitize_tags(options, app, flag))
            .await
            .map_err(|e| format!("Task failed: {}", e))?;

    Ok(result)
}

#[tauri::command]
pub async fn fix_library_album_art(
    scope_paths: Option<Vec<String>>,
    app: AppHandle,
    db: State<'_, LibraryDb>,
    cancel: State<'_, ArtRepairCancel>,
) -> Result<albumart::AlbumArtResult, AppError> {
    let flag = cancel.new_flag();
    let conn_arc = db.conn_arc();
    let cache = MbCache::new(db.conn_arc());

    let result = tauri::async_runtime::spawn_blocking(move || -> Result<_, AppError> {
        // Scoped run (e.g. post-import): only the folders containing the given
        // files. Full run: every folder in the library.
        let folders: Vec<String> = if let Some(paths) = scope_paths {
            let mut folders: Vec<String> = paths
                .iter()
                .filter_map(|p| Path::new(p).parent())
                .map(|dir| dir.to_string_lossy().to_string())
                .collect();
            folders.sort();
            folders.dedup();
            folders
                .into_iter()
                .filter(|path| !albumart::has_cover(Path::new(path)))
                .collect()
        } else {
            // Lock briefly to query folders, then release before the long-running repair
            let conn = conn_arc
                .lock()
                .map_err(|e| format!("DB lock failed: {}", e))?;

            let mut stmt = conn
                .prepare("SELECT DISTINCT folder_path FROM tracks")
                .map_err(|e| format!("Query failed: {}", e))?;

            let folders: Vec<String> = stmt
                .query_map(params![], |row| row.get(0))
                .map_err(|e| format!("Query failed: {}", e))?
                .filter_map(|r| r.ok())
                .filter(|path: &String| !albumart::has_cover(Path::new(path)))
                .collect();
            folders
        }; // lock released here

        if folders.is_empty() {
            return Ok(albumart::AlbumArtResult {
                total: 0,
                fixed: 0,
                already_ok: 0,
                failed: 0,
                cancelled: false,
                errors: Vec::new(),
            });
        }

        Ok(albumart::fix_album_art(
            folders,
            app,
            flag,
            "library-art-repair-progress",
            &cache,
        ))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    Ok(result)
}

#[tauri::command]
pub async fn upload_album_art(
    folder_path: String,
    image_path: String,
    app: AppHandle,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || -> Result<(), AppError> {
        albumart::save_uploaded_cover(&folder_path, &image_path)?;
        if let Ok(cache_dir) = app.path().app_data_dir().map(|d| d.join("thumbnails")) {
            crate::thumbnail::invalidate(&cache_dir, &folder_path);
        }
        let _ = app.emit("album-art-fixed", folder_path);
        Ok(())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub fn cancel_art_repair(cancel: State<'_, ArtRepairCancel>) -> Result<(), AppError> {
    cancel.cancel();
    Ok(())
}

// ── Thumbnail cache ────────────────────────────────────────────

#[tauri::command]
pub async fn get_thumbnail(
    folder_path: String,
    size: String,
    app: AppHandle,
) -> Result<Option<String>, AppError> {
    let cache_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?
        .join("thumbnails");

    let thumb_size = crate::thumbnail::ThumbSize::parse(&size)
        .ok_or_else(|| AppError::InvalidInput(format!("Invalid thumbnail size: {size}")))?;

    let result = tauri::async_runtime::spawn_blocking(move || {
        crate::thumbnail::get_or_create(&cache_dir, &folder_path, thumb_size)
            .map(|p| p.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;

    Ok(result)
}

#[tauri::command]
pub async fn invalidate_thumbnail(folder_path: String, app: AppHandle) -> Result<(), AppError> {
    let cache_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?
        .join("thumbnails");

    crate::thumbnail::invalidate(&cache_dir, &folder_path);
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::thumbnail::ThumbSize;

    #[test]
    fn thumb_size_parse_accepts_valid() {
        assert!(ThumbSize::parse("small").is_some());
        assert!(ThumbSize::parse("s").is_some());
        assert!(ThumbSize::parse("medium").is_some());
        assert!(ThumbSize::parse("m").is_some());
        assert!(ThumbSize::parse("large").is_some());
        assert!(ThumbSize::parse("l").is_some());
    }

    #[test]
    fn thumb_size_parse_rejects_invalid() {
        assert!(ThumbSize::parse("").is_none());
        assert!(ThumbSize::parse("xl").is_none());
        assert!(ThumbSize::parse("huge").is_none());
    }
}
