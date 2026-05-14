use lofty::prelude::{Accessor, TaggedFileExt};
use lofty::probe::Probe;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

use super::{has_cover, is_audio, AlbumInfo, ScanProgress};

/// Read artist, album, and embedded-art presence from the first parseable audio file.
fn read_metadata(dir: &Path) -> (Option<String>, Option<String>, bool) {
    let Ok(entries) = fs::read_dir(dir) else {
        return (None, None, false);
    };

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if !is_audio(&path) {
            continue;
        }
        let Ok(probe) = Probe::open(&path) else {
            continue;
        };
        let Ok(tagged) = probe.read() else { continue };
        let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) else {
            continue;
        };

        return (
            tag.artist().map(|s| s.to_string()),
            tag.album().map(|s| s.to_string()),
            !tag.pictures().is_empty(),
        );
    }
    (None, None, false)
}

fn scan_dir(
    dir: &Path,
    root: &Path,
    albums: &mut Vec<AlbumInfo>,
    app: &AppHandle,
    cancel_flag: &Arc<AtomicBool>,
) {
    if cancel_flag.load(Ordering::SeqCst) {
        return;
    }

    // Emit progress on every directory so the UI shows scanning activity
    let relative = dir
        .strip_prefix(root)
        .unwrap_or(dir)
        .to_string_lossy()
        .to_string();
    let display_folder = if relative.is_empty() {
        dir.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default()
    } else {
        relative
    };
    let _ = app.emit(
        "albumart-scan-progress",
        ScanProgress {
            albums_found: albums.len(),
            current_folder: display_folder,
        },
    );

    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    let mut audio_count = 0usize;
    let mut subdirs = Vec::new();

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        if entry.file_type().is_ok_and(|ft| ft.is_symlink()) {
            continue;
        }
        if path.is_dir() {
            subdirs.push(path);
        } else if is_audio(&path) {
            audio_count += 1;
        }
    }

    if audio_count > 0 {
        let (artist, album, embedded) = read_metadata(dir);
        let folder_name = dir
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        albums.push(AlbumInfo {
            folder_path: dir.to_string_lossy().to_string(),
            folder_name: folder_name.clone(),
            artist,
            album,
            track_count: audio_count,
            has_cover_file: has_cover(dir),
            has_embedded_art: embedded,
        });
    }

    for sub in subdirs {
        scan_dir(&sub, root, albums, app, cancel_flag);
    }
}

pub fn scan_albums(
    music_path: &str,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
) -> Result<Vec<AlbumInfo>, String> {
    log::info!("[art-scan] starting scan of: {}", music_path);
    let root = Path::new(music_path)
        .canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;
    log::info!("[art-scan] canonicalized to: {}", root.display());

    let mut albums = Vec::new();
    scan_dir(&root, &root, &mut albums, &app, &cancel_flag);
    log::info!("[art-scan] scan complete: {} albums found", albums.len());

    if cancel_flag.load(Ordering::SeqCst) {
        return Err("Cancelled".to_string());
    }

    // Missing art first, then alphabetical by artist/album
    albums.sort_by(|a, b| {
        a.has_cover_file.cmp(&b.has_cover_file).then_with(|| {
            let aa = a.artist.as_deref().unwrap_or("");
            let ba = b.artist.as_deref().unwrap_or("");
            aa.to_lowercase().cmp(&ba.to_lowercase()).then_with(|| {
                let al = a.album.as_deref().unwrap_or("");
                let bl = b.album.as_deref().unwrap_or("");
                al.to_lowercase().cmp(&bl.to_lowercase())
            })
        })
    });

    Ok(albums)
}
