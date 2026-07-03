use rusqlite::Connection;
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::AppHandle;

use crate::files::copy::{available_space, fmt_bytes};
use crate::files::types::CopyOperation;
use crate::library::types::{LibraryTrack, Playlist, PlaylistTrack};
use crate::library::{playlists, smart_playlists};
use crate::playlist_export;

#[cfg(test)]
#[path = "tests.rs"]
mod tests;

/// Destination layout on the iPod — must match what `export_playlists`
/// assumes so the exported `.m3u8` track paths resolve on-device.
pub const IPOD_MUSIC_SUBDIR: &str = "Music";
pub const IPOD_PLAYLIST_SUBDIR: &str = "Playlists";

#[derive(Debug, Clone, Serialize)]
pub struct PlaylistSyncPlanItem {
    pub id: i64,
    pub is_smart: bool,
    pub name: String,
    pub track_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct PlaylistSyncPlan {
    pub playlists: Vec<PlaylistSyncPlanItem>,
    pub total_tracks: usize,
    pub files_to_copy: usize,
    pub bytes_to_copy: u64,
    pub bytes_already_present: u64,
    pub free_space: u64,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PlaylistSyncResult {
    pub copied: usize,
    pub already_present: usize,
    pub playlists_written: usize,
    pub cancelled: bool,
    pub errors: Vec<String>,
}

pub struct ResolvedPlaylist {
    pub playlist: Playlist,
    pub is_smart: bool,
    pub tracks: Vec<PlaylistTrack>,
}

pub(crate) struct CopyPlan {
    pub operations: Vec<CopyOperation>,
    pub bytes_to_copy: u64,
    pub bytes_already_present: u64,
    pub already_present: usize,
    pub errors: Vec<String>,
}

/// Load each selected playlist (regular and smart) with its tracks.
/// Smart playlists are evaluated through the rules engine and wrapped
/// as ordinary playlists so export logic can be reused as-is.
pub fn resolve_playlists(
    conn: &Connection,
    playlist_ids: &[i64],
    smart_playlist_ids: &[i64],
) -> Result<Vec<ResolvedPlaylist>, String> {
    let mut resolved = Vec::new();

    if !playlist_ids.is_empty() {
        let all = playlists::get_playlists(conn)?;
        for id in playlist_ids {
            let playlist = all
                .iter()
                .find(|p| p.id == *id)
                .cloned()
                .ok_or_else(|| format!("Playlist {} not found", id))?;
            let tracks = playlists::get_playlist_tracks(conn, *id)?;
            resolved.push(ResolvedPlaylist {
                playlist,
                is_smart: false,
                tracks,
            });
        }
    }

    if !smart_playlist_ids.is_empty() {
        let all = smart_playlists::get_smart_playlists(conn)?;
        for id in smart_playlist_ids {
            let sp = all
                .iter()
                .find(|p| p.id == *id)
                .ok_or_else(|| format!("Smart playlist {} not found", id))?;
            let tracks = smart_playlists::get_smart_playlist_tracks(conn, *id)?;
            let playlist = Playlist {
                id: sp.id,
                name: sp.name.clone(),
                track_count: tracks.len() as u32,
                total_duration: tracks.iter().map(|t| t.duration_secs).sum(),
                created_at: sp.created_at,
                updated_at: sp.updated_at,
            };
            let tracks = tracks
                .into_iter()
                .enumerate()
                .map(|(i, track)| PlaylistTrack {
                    position: i as u32,
                    track,
                })
                .collect();
            resolved.push(ResolvedPlaylist {
                playlist,
                is_smart: true,
                tracks,
            });
        }
    }

    Ok(resolved)
}

/// Unique tracks across all selected playlists, deduped by file path.
pub(crate) fn dedupe_tracks(resolved: &[ResolvedPlaylist]) -> Vec<&LibraryTrack> {
    let mut seen = HashSet::new();
    let mut tracks = Vec::new();
    for rp in resolved {
        for pt in &rp.tracks {
            if seen.insert(pt.track.file_path.as_str()) {
                tracks.push(&pt.track);
            }
        }
    }
    tracks
}

/// Decide, per track, whether it must be copied to `music_dir` or is already
/// present (same relative destination path, same size — costs nothing).
pub(crate) fn plan_copies(
    tracks: &[&LibraryTrack],
    library_root: &str,
    music_dir: &Path,
) -> CopyPlan {
    let lib_root = library_root.trim_end_matches('/');
    let mut plan = CopyPlan {
        operations: Vec::new(),
        bytes_to_copy: 0,
        bytes_already_present: 0,
        already_present: 0,
        errors: Vec::new(),
    };

    for track in tracks {
        let rel = match track.file_path.strip_prefix(lib_root) {
            Some(r) => r.trim_start_matches('/'),
            None => {
                plan.errors.push(format!(
                    "\"{}\" — track outside library root, skipped",
                    track.file_name
                ));
                continue;
            }
        };

        let src_size = match fs::metadata(&track.file_path) {
            Ok(m) => m.len(),
            Err(e) => {
                plan.errors.push(format!(
                    "\"{}\" — source unreadable: {}",
                    track.file_name, e
                ));
                continue;
            }
        };

        let dest = music_dir.join(rel);
        let present = fs::metadata(&dest)
            .map(|m| m.len() == src_size)
            .unwrap_or(false);
        if present {
            plan.already_present += 1;
            plan.bytes_already_present += src_size;
        } else {
            plan.bytes_to_copy += src_size;
            plan.operations.push(CopyOperation {
                source_path: track.file_path.clone(),
                dest_path: dest.to_string_lossy().to_string(),
            });
        }
    }

    plan
}

/// Dry-run: what the sync would do, without copying anything.
pub fn build_plan(
    resolved: &[ResolvedPlaylist],
    library_root: &str,
    mount_point: &str,
) -> PlaylistSyncPlan {
    let music_dir = Path::new(mount_point).join(IPOD_MUSIC_SUBDIR);
    let tracks = dedupe_tracks(resolved);
    let copy_plan = plan_copies(&tracks, library_root, &music_dir);

    PlaylistSyncPlan {
        playlists: resolved
            .iter()
            .map(|rp| PlaylistSyncPlanItem {
                id: rp.playlist.id,
                is_smart: rp.is_smart,
                name: rp.playlist.name.clone(),
                track_count: rp.tracks.len(),
            })
            .collect(),
        total_tracks: tracks.len(),
        files_to_copy: copy_plan.operations.len(),
        bytes_to_copy: copy_plan.bytes_to_copy,
        bytes_already_present: copy_plan.bytes_already_present,
        free_space: available_space(Path::new(mount_point)).unwrap_or(0),
        errors: copy_plan.errors,
    }
}

/// Copy missing tracks to the iPod's Music directory, then write the
/// `.m3u8` playlist files. Emits `sync-progress` events and honors the
/// shared cancel flag (both via `copy_file_list`).
pub fn run_sync(
    resolved: Vec<ResolvedPlaylist>,
    library_root: String,
    mount_point: String,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
) -> Result<PlaylistSyncResult, String> {
    let mount = Path::new(&mount_point);
    let music_dir = mount.join(IPOD_MUSIC_SUBDIR);

    let tracks = dedupe_tracks(&resolved);
    let plan = plan_copies(&tracks, &library_root, &music_dir);

    if let Some(free) = available_space(mount) {
        if plan.bytes_to_copy > free {
            return Err(format!(
                "Not enough space on iPod: need {} but only {} free",
                fmt_bytes(plan.bytes_to_copy),
                fmt_bytes(free)
            ));
        }
    }

    let mut errors = plan.errors;
    let copy_result = crate::files::copy_file_list(plan.operations, None, app, cancel_flag);
    errors.extend(copy_result.errors);

    if copy_result.cancelled {
        return Ok(PlaylistSyncResult {
            copied: copy_result.succeeded,
            already_present: plan.already_present,
            playlists_written: 0,
            cancelled: true,
            errors,
        });
    }

    let playlist_dir = mount.join(IPOD_PLAYLIST_SUBDIR);
    let with_tracks: Vec<(Playlist, Vec<PlaylistTrack>)> = resolved
        .into_iter()
        .map(|rp| (rp.playlist, rp.tracks))
        .collect();
    let export = playlist_export::export_playlists(
        with_tracks,
        &library_root,
        IPOD_MUSIC_SUBDIR,
        &playlist_dir.to_string_lossy(),
    );
    errors.extend(export.errors);

    Ok(PlaylistSyncResult {
        copied: copy_result.succeeded,
        already_present: plan.already_present,
        playlists_written: export.exported,
        cancelled: false,
        errors,
    })
}
