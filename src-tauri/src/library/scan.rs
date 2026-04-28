use crate::audio_utils::collect_audio_files;
use lofty::prelude::{Accessor, AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::ItemKey;
use rusqlite::{params, Connection};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Emitter};

use super::folders::get_folders;
use super::now_epoch;
use super::types::{LibraryScanProgress, TrackData};

pub fn scan_folder(
    conn: &Connection,
    folder_path: &str,
    app: &AppHandle,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<usize, String> {
    let root = Path::new(folder_path);
    if !root.exists() {
        return Err(format!("Path does not exist: {}", folder_path));
    }

    let mut audio_files = Vec::new();
    collect_audio_files(root, &mut audio_files);

    let total = audio_files.len();
    let now = now_epoch();
    let mut scanned = 0;

    for (i, file_path) in audio_files.iter().enumerate() {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err("Cancelled".to_string());
        }

        let file_name = file_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let _ = app.emit(
            "library-scan-progress",
            LibraryScanProgress {
                total,
                completed: i,
                current_file: file_name,
            },
        );

        let file_path_str = file_path.to_string_lossy().to_string();
        let mtime = fs::metadata(file_path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let existing_mtime: Option<i64> = conn
            .query_row(
                "SELECT modified_at FROM tracks WHERE file_path = ?1",
                params![file_path_str],
                |row| row.get(0),
            )
            .ok();

        if existing_mtime == Some(mtime) {
            scanned += 1;
            continue;
        }

        if let Some(track_data) = read_track_for_library(file_path) {
            upsert_track(conn, &track_data, mtime, now)?;
        }

        scanned += 1;
    }

    // Remove tracks that no longer exist on disk for this folder
    let mut stmt = conn
        .prepare("SELECT file_path FROM tracks WHERE file_path LIKE ?1")
        .map_err(|e| format!("Query failed: {}", e))?;

    let db_paths: Vec<String> = stmt
        .query_map(params![format!("{}%", folder_path)], |row| row.get(0))
        .map_err(|e| format!("Query failed: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    for db_path in &db_paths {
        if !Path::new(db_path).exists() {
            conn.execute("DELETE FROM tracks WHERE file_path = ?1", params![db_path])
                .ok();
        }
    }

    Ok(scanned)
}

pub fn rescan_all_folders(
    conn: &Connection,
    app: &AppHandle,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<(), String> {
    let folders = get_folders(conn)?;

    let mut all_files: Vec<(PathBuf, String)> = Vec::new();
    for folder in &folders {
        let root = Path::new(&folder.path);
        if !root.exists() {
            continue;
        }
        let mut folder_files = Vec::new();
        collect_audio_files(root, &mut folder_files);
        for f in folder_files {
            all_files.push((f, folder.path.clone()));
        }
    }

    let total = all_files.len();
    let now = now_epoch();

    for (i, (file_path, _folder_path)) in all_files.iter().enumerate() {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err("Cancelled".to_string());
        }

        let file_name = file_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let _ = app.emit(
            "library-scan-progress",
            LibraryScanProgress {
                total,
                completed: i,
                current_file: file_name,
            },
        );

        let file_path_str = file_path.to_string_lossy().to_string();
        let mtime = fs::metadata(file_path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let existing_mtime: Option<i64> = conn
            .query_row(
                "SELECT modified_at FROM tracks WHERE file_path = ?1",
                params![file_path_str],
                |row| row.get(0),
            )
            .ok();

        if existing_mtime == Some(mtime) {
            continue;
        }

        if let Some(track_data) = read_track_for_library(file_path) {
            upsert_track(conn, &track_data, mtime, now)?;
        }
    }

    // Remove orphaned tracks for each folder
    for folder in &folders {
        let mut stmt = conn
            .prepare("SELECT file_path FROM tracks WHERE file_path LIKE ?1")
            .map_err(|e| format!("Query failed: {}", e))?;

        let db_paths: Vec<String> = stmt
            .query_map(params![format!("{}%", folder.path)], |row| row.get(0))
            .map_err(|e| format!("Query failed: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        for db_path in &db_paths {
            if !Path::new(db_path).exists() {
                conn.execute("DELETE FROM tracks WHERE file_path = ?1", params![db_path])
                    .ok();
            }
        }
    }

    let _ = app.emit(
        "library-scan-progress",
        LibraryScanProgress {
            total,
            completed: total,
            current_file: String::new(),
        },
    );

    Ok(())
}

pub(crate) fn read_track_for_library(path: &Path) -> Option<TrackData> {
    let file_path = path.to_string_lossy().to_string();
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let folder_path = path
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let format = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_uppercase())
        .unwrap_or_default();
    let file_size = fs::metadata(path).map(|m| m.len()).unwrap_or(0);

    let probe = Probe::open(path).ok()?;
    let tagged = probe.read().ok()?;

    let props = tagged.properties();
    let duration_secs = props.duration().as_secs_f64();
    let sample_rate = props.sample_rate();
    let bitrate_kbps = props.audio_bitrate();

    let tag = tagged.primary_tag().or_else(|| tagged.first_tag());

    let trim_tag = |s: &str| {
        let trimmed = s.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    };

    let (
        title,
        artist,
        album,
        album_artist,
        sort_artist,
        sort_album_artist,
        track_number,
        track_total,
        disc_number,
        disc_total,
        year,
        genre,
        play_count,
    ) = if let Some(tag) = tag {
        // Try reading play count from common tag fields:
        // - TXXX:FMPS_PLAYCOUNT (MediaMonkey, Clementine, etc.)
        // - Vorbis comment FMPS_PLAYCOUNT / PLAY_COUNTER
        // - ItemKey::Popularimeter (ID3v2 POPM frame)
        let pc = tag
            .get_string(&ItemKey::Unknown("FMPS_PLAYCOUNT".into()))
            .and_then(|s| s.trim().parse::<f64>().ok())
            .map(|v| v as u32)
            .or_else(|| {
                tag.get_string(&ItemKey::Popularimeter)
                    .and_then(|s| s.trim().parse::<u32>().ok())
            });

        (
            tag.title().and_then(|s| trim_tag(&s)),
            tag.artist().and_then(|s| trim_tag(&s)),
            tag.album().and_then(|s| trim_tag(&s)),
            tag.get_string(&ItemKey::AlbumArtist).and_then(trim_tag),
            tag.get_string(&ItemKey::TrackArtistSortOrder)
                .and_then(trim_tag),
            tag.get_string(&ItemKey::AlbumArtistSortOrder)
                .and_then(trim_tag),
            tag.track(),
            tag.track_total(),
            tag.disk(),
            tag.disk_total(),
            tag.year(),
            tag.genre().and_then(|s| trim_tag(&s)),
            pc,
        )
    } else {
        (
            None, None, None, None, None, None, None, None, None, None, None, None, None,
        )
    };

    Some(TrackData {
        file_path,
        file_name,
        folder_path,
        title,
        artist,
        album,
        album_artist,
        sort_artist,
        sort_album_artist,
        track_number,
        track_total,
        disc_number,
        disc_total,
        year,
        genre,
        duration_secs,
        sample_rate,
        bitrate_kbps,
        format,
        file_size,
        play_count,
    })
}

pub(crate) fn upsert_track(
    conn: &Connection,
    t: &TrackData,
    mtime: i64,
    now: i64,
) -> Result<(), String> {
    let tag_play_count = t.play_count.unwrap_or(0) as i64;
    conn.execute(
        "INSERT INTO tracks (
            file_path, file_name, folder_path, title, artist, album, album_artist,
            sort_artist, sort_album_artist, track_number, track_total, disc_number,
            disc_total, year, genre, duration_secs, sample_rate, bitrate_kbps, format,
            file_size, modified_at, scanned_at, created_at, play_count
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15,
            ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24
        )
        ON CONFLICT(file_path) DO UPDATE SET
            file_name=excluded.file_name, folder_path=excluded.folder_path,
            title=excluded.title, artist=excluded.artist, album=excluded.album,
            album_artist=excluded.album_artist, sort_artist=excluded.sort_artist,
            sort_album_artist=excluded.sort_album_artist, track_number=excluded.track_number,
            track_total=excluded.track_total, disc_number=excluded.disc_number,
            disc_total=excluded.disc_total, year=excluded.year, genre=excluded.genre,
            duration_secs=excluded.duration_secs, sample_rate=excluded.sample_rate,
            bitrate_kbps=excluded.bitrate_kbps, format=excluded.format,
            file_size=excluded.file_size, modified_at=excluded.modified_at,
            scanned_at=excluded.scanned_at,
            play_count=MAX(play_count, excluded.play_count)",
        params![
            t.file_path,
            t.file_name,
            t.folder_path,
            t.title,
            t.artist,
            t.album,
            t.album_artist,
            t.sort_artist,
            t.sort_album_artist,
            t.track_number,
            t.track_total,
            t.disc_number,
            t.disc_total,
            t.year,
            t.genre,
            t.duration_secs,
            t.sample_rate,
            t.bitrate_kbps,
            t.format,
            t.file_size as i64,
            mtime,
            now,
            now,
            tag_play_count,
        ],
    )
    .map_err(|e| format!("Failed to upsert track: {}", e))?;

    Ok(())
}
