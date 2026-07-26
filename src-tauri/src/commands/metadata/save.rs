//! The metadata save path.
//!
//! A save does the minimum the user is waiting on and nothing more: write the
//! tags, upsert the affected rows, hand those rows to the frontend so it can
//! patch them in place, and return. Everything else — moving files into the
//! library's folder layout, refreshing the column browser — happens after the
//! UI has already repainted.
//!
//! Two costs used to sit on this path and no longer do:
//!
//! - **Reorganization.** Renaming a file, migrating its cover art and pruning
//!   empty directories is cheap per file but it is not something the user should
//!   wait on, and it is what makes a save's file paths unstable. It now runs as
//!   a background task that emits its own row update when the moves land.
//! - **The browser refetch.** The old `library-files-reorganized` event made the
//!   frontend re-query the entire browser — on a 47k-track library that shipped
//!   the full genre/artist/album aggregates (~675KB of JSON) and a track page
//!   per save, then re-rendered every sidebar row. The frontend now patches the
//!   rows it is handed and only refreshes the sidebar when a grouping field
//!   actually changed.

use crate::error::AppError;
use crate::files::SyncCancel;
use crate::library::{self, LibraryDb, LibraryTrack};
use crate::metadata;
use crate::watcher::{FolderWatcher, RecentWrites};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

/// Emitted whenever specific track rows change, so the frontend can patch them
/// instead of re-querying the library.
#[derive(Debug, Clone, Serialize)]
pub struct TracksUpdated {
    pub tracks: Vec<LibraryTrack>,
    /// Set when the edit touched a field the column browser groups by, telling
    /// the frontend its sidebar aggregates need a refresh. Row-only changes
    /// (title, track number, a file move) leave the sidebar alone.
    pub aggregates_stale: bool,
}

pub const TRACKS_UPDATED_EVENT: &str = "library-tracks-updated";

type SharedConn = Arc<Mutex<rusqlite::Connection>>;

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

    // An undo operation names its file by path, but the background reorganize
    // may have moved that file since the save that produced it. Re-resolve any
    // stale path from the track id before touching the disk.
    let updates = resolve_moved_paths(&conn_arc, updates)?;

    let file_paths: Vec<String> = updates.iter().map(|u| u.file_path.clone()).collect();

    // Only fields that feed compute_library_dest can move files. Saves that
    // touch nothing else (genre, year, sort fields…) skip reorganization
    // entirely.
    let affects_paths = updates.iter().any(|u| {
        u.title.is_some()
            || u.artist.is_some()
            || u.album.is_some()
            || u.album_artist.is_some()
            || u.track.is_some()
            || u.disc_number.is_some()
    });

    // Fields the column browser groups by. Anything else leaves the sidebar
    // lists — and their counts — exactly as they were.
    let aggregates_stale = updates.iter().any(|u| {
        u.artist.is_some() || u.album_artist.is_some() || u.album.is_some() || u.genre.is_some()
    });

    let id3_version = {
        let conn = conn_arc
            .lock()
            .map_err(|e| AppError::from(format!("DB lock failed: {}", e)))?;
        metadata::Id3WriteVersion::from_setting(
            library::get_setting(&conn, metadata::Id3WriteVersion::SETTING_KEY).as_deref(),
        )
    };

    // Mark the edited files as our own writes so the watcher discards the
    // write/move events they generate instead of re-syncing them and firing a
    // redundant `library-changed` refresh. The watcher keeps running throughout:
    // restarting it would rebuild the debouncer's file-id cache, which walks and
    // stats the entire library.
    watcher.suppress_paths(file_paths.iter().map(|p| PathBuf::from(p.as_str())));

    let app_for_write = app.clone();
    let mut result = tauri::async_runtime::spawn_blocking(move || {
        Ok::<_, AppError>(metadata::save_metadata(
            updates,
            app_for_write,
            flag,
            id3_version,
        ))
    })
    .await
    .map_err(|e| AppError::from(format!("Task failed: {}", e)))??;

    let conn_for_db = conn_arc.clone();
    let paths_for_db = file_paths.clone();
    let (library_root, updated) = tauri::async_runtime::spawn_blocking(move || {
        upsert_saved_files(&conn_for_db, &paths_for_db)
    })
    .await
    .map_err(|e| AppError::from(format!("Task failed: {}", e)))??;

    // Carry the row ids onto the undo operations so undoing still finds these
    // files after the background reorganize moves them.
    for row in &updated {
        for undo_op in &mut result.undo_operations {
            if undo_op.file_path == row.file_path {
                undo_op.track_id = Some(row.id);
            }
        }
    }

    // Repaint before doing any of the work the user isn't waiting on. A save
    // outside the library (the metadata editor pointed at an arbitrary folder)
    // has no rows to patch and correctly emits nothing.
    if !updated.is_empty() {
        let _ = app.emit(
            TRACKS_UPDATED_EVENT,
            TracksUpdated {
                tracks: updated,
                aggregates_stale,
            },
        );
    }

    if affects_paths {
        if let Some(root) = library_root {
            spawn_reorganize(app, conn_arc, watcher.recent_writes(), root, file_paths);
        }
    }

    Ok(result)
}

/// Re-point updates whose file has moved since the operation was recorded.
///
/// Only touched when the recorded path is gone *and* a track id is present, so
/// the common case costs one `exists()` per file. Updates the frontend builds
/// carry no id and are left alone.
fn resolve_moved_paths(
    conn_arc: &SharedConn,
    mut updates: Vec<metadata::MetadataUpdate>,
) -> Result<Vec<metadata::MetadataUpdate>, AppError> {
    let stale = updates
        .iter()
        .any(|u| u.track_id.is_some() && !Path::new(&u.file_path).exists());
    if !stale {
        return Ok(updates);
    }

    let conn = conn_arc
        .lock()
        .map_err(|e| AppError::from(format!("DB lock failed: {}", e)))?;
    for update in &mut updates {
        let Some(id) = update.track_id else { continue };
        if Path::new(&update.file_path).exists() {
            continue;
        }
        if let Ok(track) = library::get_track_by_id(&conn, id) {
            update.file_path = track.file_path;
        }
    }
    Ok(updates)
}

/// Re-read the saved files' tags and upsert them, returning the library root (if
/// one is configured) and the resulting rows.
///
/// Tag parsing happens outside the DB lock — it's the expensive part — and the
/// upserts share one transaction so the batch costs a single commit instead of
/// one per file.
fn upsert_saved_files(
    conn_arc: &SharedConn,
    file_paths: &[String],
) -> Result<(Option<String>, Vec<LibraryTrack>), AppError> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

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

    let conn = conn_arc
        .lock()
        .map_err(|e| AppError::from(format!("DB lock failed: {}", e)))?;

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| AppError::from(format!("Transaction failed: {}", e)))?;
    for (track_data, mtime) in &track_updates {
        library::upsert_track(&tx, track_data, *mtime, now).ok();
    }
    tx.commit()
        .map_err(|e| AppError::from(format!("Commit failed: {}", e)))?;

    let library_root = library::get_library_location(&conn);
    let updated = library::get_tracks_by_paths(&conn, file_paths)?;
    Ok((library_root, updated))
}

/// Move saved files into the library's folder layout in the background.
///
/// Deliberately off the save's critical path: the rename itself is cheap, but
/// it also migrates cover art and prunes empty directories, and none of that is
/// something the user should wait on to see their edit. This mirrors how iTunes
/// and Swinsian treat organization — a consequence of tagging, not part of it.
///
/// Each rename is suppressed in `recent_writes` the moment it completes rather
/// than in one batch afterwards: the watcher runs throughout, so on a batch that
/// outlasts the debouncer window the early files' Create events would otherwise
/// flush before their new paths were registered, costing a redundant refresh.
///
/// Stale rows at pre-move paths are deleted by `reorganize_library_file` itself;
/// library-wide ghost cleanup belongs to the scan path, which has a walk-based
/// fast path and snapshots the DB before deleting.
fn spawn_reorganize(
    app: AppHandle,
    conn_arc: SharedConn,
    recent_writes: RecentWrites,
    library_root: String,
    file_paths: Vec<String>,
) {
    tauri::async_runtime::spawn_blocking(move || {
        let mut moved = Vec::new();
        for file_path in &file_paths {
            if !file_path.starts_with(&library_root) {
                continue;
            }
            let Ok(conn) = conn_arc.lock() else {
                log::warn!("Skipping reorganize for {file_path}: DB lock poisoned");
                return;
            };
            match library::reorganize_library_file(&conn, &library_root, file_path) {
                Ok(Some(new_path)) => {
                    crate::watcher::suppress_in(&recent_writes, [PathBuf::from(new_path.as_str())]);
                    moved.push(new_path);
                }
                Ok(None) => {}
                Err(e) => log::warn!("Failed to reorganize {}: {}", file_path, e),
            }
        }

        if moved.is_empty() {
            return;
        }

        // Hand the frontend the moved rows so it can update the paths it
        // patched a moment ago. Only paths changed, so the sidebar is untouched.
        let rows = conn_arc
            .lock()
            .ok()
            .and_then(|conn| library::get_tracks_by_paths(&conn, &moved).ok())
            .unwrap_or_default();
        if !rows.is_empty() {
            let _ = app.emit(
                TRACKS_UPDATED_EVENT,
                TracksUpdated {
                    tracks: rows,
                    aggregates_stale: false,
                },
            );
        }
    });
}

#[cfg(test)]
#[path = "save_tests.rs"]
mod tests;
