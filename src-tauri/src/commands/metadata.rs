use crate::albumart;
use crate::error::AppError;
use crate::files::{ArtRepairCancel, SyncCancel};
use crate::library::{self, LibraryDb};
use crate::metadata;
use crate::metarepair;
use crate::musicbrainz::MbCache;
use crate::sanitize;
use crate::watcher::FolderWatcher;
use rusqlite::params;
use std::path::{Path, PathBuf};
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
pub async fn save_metadata(
    updates: Vec<metadata::MetadataUpdate>,
    app: AppHandle,
    db: State<'_, LibraryDb>,
    watcher: State<'_, FolderWatcher>,
    cancel: State<'_, SyncCancel>,
) -> Result<metadata::MetadataSaveResult, AppError> {
    let flag = cancel.new_flag();
    let conn_arc = db.conn_arc();
    let conn_arc_for_restart = conn_arc.clone();
    let app_clone = app.clone();
    let app_for_restart = app.clone();

    let file_paths: Vec<String> = updates.iter().map(|u| u.file_path.clone()).collect();

    // Only fields that feed compute_library_dest can move files. Saves that
    // touch nothing else (genre, year, sort fields…) skip the reorganize
    // pass and the whole-library ghost sweep entirely.
    let affects_paths = updates.iter().any(|u| {
        u.title.is_some()
            || u.artist.is_some()
            || u.album.is_some()
            || u.album_artist.is_some()
            || u.track.is_some()
            || u.disc_number.is_some()
    });

    let id3_version = {
        let conn = conn_arc
            .lock()
            .map_err(|e| AppError::from(format!("DB lock failed: {}", e)))?;
        metadata::Id3WriteVersion::from_setting(
            library::get_setting(&conn, metadata::Id3WriteVersion::SETTING_KEY).as_deref(),
        )
    };

    // Stop the file watcher entirely so the debouncer is dropped and all
    // queued/pending OS filesystem events are discarded.
    watcher.stop();

    // Mark the edited files as our own writes. The watcher restarts below and
    // the OS can deliver these files' write/move events to the fresh watcher,
    // which would otherwise re-sync them and fire a redundant `library-changed`
    // refresh a few seconds after the save (post-move paths are added later).
    watcher.suppress_paths(file_paths.iter().map(|p| PathBuf::from(p.as_str())));

    let final_result: Result<metadata::MetadataSaveResult, AppError> = async {
        let mut result = tauri::async_runtime::spawn_blocking(move || {
            Ok::<_, AppError>(metadata::save_metadata(updates, app, flag, id3_version))
        })
        .await
        .map_err(|e| AppError::from(format!("Task failed: {}", e)))??;

        // Refresh the library DB on a blocking thread, holding the lock only
        // for short stretches so browsing and filtering stay responsive while
        // large batches (e.g. whole-album genre applies) are processed.
        let conn_for_db = conn_arc.clone();
        let paths_for_db = file_paths.clone();
        let (is_library, path_renames) = tauri::async_runtime::spawn_blocking(move || {
            update_library_after_save(&conn_for_db, &paths_for_db, affects_paths)
        })
        .await
        .map_err(|e| AppError::from(format!("Task failed: {}", e)))??;

        // Suppress the post-move paths too, so the watcher ignores the Create
        // events for files the reorganize just moved into place.
        watcher.suppress_paths(
            path_renames
                .iter()
                .map(|(_, new)| PathBuf::from(new.as_str())),
        );

        // Update undo operations with post-reorganization file paths
        for (old_path, new_path) in &path_renames {
            for undo_op in &mut result.undo_operations {
                if undo_op.file_path == *old_path {
                    undo_op.file_path = new_path.clone();
                }
            }
        }

        if is_library {
            let _ = app_clone.emit("library-files-reorganized", file_paths.len());
        }

        Ok(result)
    }
    .await;

    // Always restart the watcher, regardless of success or failure.
    if let Err(e) =
        crate::watcher::restart_from_db(&watcher, &app_for_restart, &conn_arc_for_restart)
    {
        log::warn!("Failed to restart file watcher after metadata save: {}", e);
    }

    final_result
}

type PathRenames = Vec<(String, String)>;

/// Upsert saved files into the library DB, reorganize them, and clean up
/// orphaned rows. File I/O (tag re-reads, ghost checks) happens outside the
/// DB lock, and each step takes its own short lock, so concurrent library
/// queries are never blocked for the whole batch.
/// Returns whether the files live in the library and any (old, new) renames.
fn update_library_after_save(
    conn_arc: &std::sync::Arc<std::sync::Mutex<rusqlite::Connection>>,
    file_paths: &[String],
    affects_paths: bool,
) -> Result<(bool, PathRenames), AppError> {
    let lock_conn = || {
        conn_arc
            .lock()
            .map_err(|e| AppError::from(format!("DB lock failed: {}", e)))
    };

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    // Re-read tags from the saved files without holding the DB lock —
    // this is the expensive part (a full tag parse per file).
    let track_updates: Vec<_> = file_paths
        .iter()
        .filter_map(|file_path| {
            let path = Path::new(file_path);
            if !path.exists() {
                return None;
            }
            let mtime = std::fs::metadata(path)
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(now);
            Some((library::read_track_for_library(path), mtime))
        })
        .collect();

    let library_root = {
        let conn = lock_conn()?;
        for (track_data, mtime) in &track_updates {
            library::upsert_track(&conn, track_data, *mtime, now).ok();
        }
        library::get_library_location(&conn)
    };

    let Some(library_root) = library_root else {
        return Ok((false, Vec::new()));
    };

    // No path-affecting fields changed: files can't need renaming and no
    // rows can be orphaned, so the rename pass and ghost sweep are no-ops.
    if !affects_paths {
        return Ok((true, Vec::new()));
    }

    // Track path changes so undo operations use the correct
    // (post-reorganization) file paths.
    let mut path_renames: PathRenames = Vec::new();
    for file_path in file_paths {
        if !file_path.starts_with(&library_root) {
            continue;
        }
        let conn = lock_conn()?;
        match library::reorganize_library_file(&conn, &library_root, file_path) {
            Ok(Some(new_path)) => {
                path_renames.push((file_path.clone(), new_path));
            }
            Ok(None) => {}
            Err(e) => {
                log::warn!("Failed to reorganize {}: {}", file_path, e);
            }
        }
    }

    let all_paths: Vec<String> = {
        let conn = lock_conn()?;
        conn.prepare("SELECT file_path FROM tracks WHERE file_path LIKE ?1")
            .and_then(|mut stmt| {
                stmt.query_map(params![format!("{}%", library_root)], |row| {
                    row.get::<_, String>(0)
                })
                .map(|rows| rows.filter_map(|r| r.ok()).collect())
            })
            .unwrap_or_default()
    };

    let mut cleaned = 0usize;
    for path_str in &all_paths {
        let conn = lock_conn()?;
        if library::is_ghost_path(path_str, &conn)
            && conn
                .execute(
                    "DELETE FROM tracks WHERE file_path = ?1",
                    params![path_str.as_str()],
                )
                .is_ok()
        {
            cleaned += 1;
        }
    }
    if cleaned > 0 {
        log::info!("Cleaned {} orphaned library tracks", cleaned);
    }

    Ok((true, path_renames))
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
