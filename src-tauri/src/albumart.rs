use lofty::picture::PictureType;
use lofty::prelude::{Accessor, TaggedFileExt};
use lofty::probe::Probe;
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

const AUDIO_EXT: &[&str] = &[
    "mp3", "flac", "m4a", "ogg", "opus", "wav", "aiff", "wma", "aac",
];

const COVER_NAMES: &[&str] = &[
    "cover.jpg",
    "cover.jpeg",
    "cover.png",
    "cover.bmp",
    "folder.jpg",
    "folder.jpeg",
    "album.jpg",
    "album.jpeg",
    "front.jpg",
    "front.jpeg",
];

#[derive(Debug, Clone, Serialize)]
pub struct AlbumInfo {
    pub folder_path: String,
    pub folder_name: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub track_count: usize,
    pub has_cover_file: bool,
    pub has_embedded_art: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct AlbumArtProgress {
    pub total: usize,
    pub completed: usize,
    pub current_album: String,
    pub phase: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AlbumArtResult {
    pub total: usize,
    pub fixed: usize,
    pub already_ok: usize,
    pub failed: usize,
    pub cancelled: bool,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanProgress {
    pub albums_found: usize,
    pub current_folder: String,
}

// ── Helpers ───────────────────────────────────────────────────────

fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXT.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn has_cover(dir: &Path) -> bool {
    find_cover(dir).is_some()
}

/// Find the first existing cover art file in a directory, returning its full path.
fn find_cover(dir: &Path) -> Option<std::path::PathBuf> {
    let Ok(entries) = fs::read_dir(dir) else {
        return None;
    };
    let files: Vec<(String, std::path::PathBuf)> = entries
        .filter_map(|e| e.ok())
        .map(|e| {
            let name = e.file_name().to_string_lossy().to_lowercase();
            (name, e.path())
        })
        .collect();
    for cover_name in COVER_NAMES {
        if let Some((_, path)) = files.iter().find(|(name, _)| name == *cover_name) {
            return Some(path.clone());
        }
    }
    None
}

/// Ensure cover.jpg exists in the directory. If another cover variant exists
/// (e.g. folder.jpg, album.jpg), convert it to cover.jpg.
fn normalize_cover(dir: &Path) -> Result<bool, String> {
    let cover_jpg = dir.join("cover.jpg");
    if cover_jpg.exists() {
        return Ok(true);
    }

    let Some(existing) = find_cover(dir) else {
        return Ok(false);
    };

    // Load and re-save as cover.jpg (handles format conversion from png/bmp/jpeg)
    let img = image::open(&existing)
        .map_err(|e| format!("Failed to read {}: {}", existing.display(), e))?;
    img.save(&cover_jpg)
        .map_err(|e| format!("Failed to save cover.jpg: {}", e))?;

    Ok(true)
}

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

// ── Scanning ──────────────────────────────────────────────────────

fn scan_dir(
    dir: &Path,
    albums: &mut Vec<AlbumInfo>,
    app: &AppHandle,
    cancel_flag: &Arc<AtomicBool>,
) {
    if cancel_flag.load(Ordering::SeqCst) {
        return;
    }

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

        let _ = app.emit(
            "albumart-scan-progress",
            ScanProgress {
                albums_found: albums.len(),
                current_folder: folder_name,
            },
        );
    }

    for sub in subdirs {
        scan_dir(&sub, albums, app, cancel_flag);
    }
}

pub fn scan_albums(
    music_path: &str,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
) -> Result<Vec<AlbumInfo>, String> {
    let root = Path::new(music_path)
        .canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;

    let mut albums = Vec::new();
    scan_dir(&root, &mut albums, &app, &cancel_flag);

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

// ── Fixing ────────────────────────────────────────────────────────

/// Extract embedded album art from the first audio file that has it → cover.jpg
fn extract_embedded(dir: &Path) -> Result<bool, String> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Err("Cannot read directory".into());
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

        // Prefer front cover, fall back to any picture
        let pic = tag
            .pictures()
            .iter()
            .find(|p| p.pic_type() == PictureType::CoverFront)
            .or_else(|| tag.pictures().first());

        let Some(pic) = pic else { continue };

        let img =
            image::load_from_memory(pic.data()).map_err(|e| format!("Decode failed: {}", e))?;

        // Resize if oversized to save iPod storage
        let img = if img.width() > 600 || img.height() > 600 {
            img.resize(600, 600, image::imageops::FilterType::Lanczos3)
        } else {
            img
        };

        img.save(dir.join("cover.jpg"))
            .map_err(|e| format!("Save failed: {}", e))?;

        return Ok(true);
    }
    Ok(false)
}

/// Try to download and save cover art from a list of MusicBrainz releases.
fn try_save_cover(releases: &[crate::musicbrainz::MbRelease], dir: &Path) -> Result<(), String> {
    for release in releases {
        let Ok(bytes) = crate::musicbrainz::fetch_cover_art(&release.id) else {
            continue;
        };

        let Ok(img) = image::load_from_memory(&bytes) else {
            continue;
        };

        let img = if img.width() > 600 || img.height() > 600 {
            img.resize(600, 600, image::imageops::FilterType::Lanczos3)
        } else {
            img
        };

        img.save(dir.join("cover.jpg"))
            .map_err(|e| format!("Save failed: {}", e))?;

        return Ok(());
    }

    Err("No cover art found".into())
}

/// Fetch cover art from the MusicBrainz Cover Art Archive.
/// Tries exact names first, then retries with normalized names (stripping
/// disc indicators, edition markers, remaster tags, etc.).
fn fetch_from_musicbrainz(artist: &str, album: &str, dir: &Path) -> Result<(), String> {
    // Attempt 1: exact names
    if let Ok(releases) = crate::musicbrainz::search_releases(artist, album) {
        if !releases.is_empty() && try_save_cover(&releases, dir).is_ok() {
            return Ok(());
        }
    }

    // Attempt 2: normalized album name (strip disc/edition/remaster noise)
    let clean_album = crate::musicbrainz::normalize_for_search(album);
    let clean_artist = crate::musicbrainz::normalize_for_search(artist);

    let album_changed = clean_album != album;
    let artist_changed = clean_artist != artist;

    if album_changed {
        if let Ok(releases) = crate::musicbrainz::search_releases(artist, &clean_album) {
            if !releases.is_empty() && try_save_cover(&releases, dir).is_ok() {
                return Ok(());
            }
        }
    }

    // Attempt 3: both normalized
    if artist_changed && album_changed {
        if let Ok(releases) = crate::musicbrainz::search_releases(&clean_artist, &clean_album) {
            if !releases.is_empty() && try_save_cover(&releases, dir).is_ok() {
                return Ok(());
            }
        }
    } else if artist_changed {
        if let Ok(releases) = crate::musicbrainz::search_releases(&clean_artist, album) {
            if !releases.is_empty() && try_save_cover(&releases, dir).is_ok() {
                return Ok(());
            }
        }
    }

    Err("No cover art found on MusicBrainz".into())
}

/// Fix album art for a list of folders.
/// Tries embedded extraction first (fast, no network), then MusicBrainz.
pub fn fix_album_art(
    folders: Vec<String>,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
) -> AlbumArtResult {
    let total = folders.len();
    let mut fixed = 0;
    let mut already_ok = 0;
    let mut failed = 0;
    let mut errors = Vec::new();
    let mut cancelled = false;

    for (i, folder_str) in folders.iter().enumerate() {
        if cancel_flag.load(Ordering::SeqCst) {
            cancelled = true;
            break;
        }

        let dir = Path::new(folder_str);
        let name = dir
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let _ = app.emit(
            "albumart-progress",
            AlbumArtProgress {
                total,
                completed: i,
                current_album: name.clone(),
                phase: "processing".to_string(),
            },
        );

        // Ensure cover.jpg exists — if another variant (folder.jpg, album.jpg, etc.)
        // exists, convert it to cover.jpg so the frontend can display it.
        match normalize_cover(dir) {
            Ok(true) => {
                already_ok += 1;
                continue;
            }
            Ok(false) => {}
            Err(e) => log::warn!("Cover normalize failed for {}: {}", name, e),
        }

        // Try embedded extraction first (fast, no network needed)
        match extract_embedded(dir) {
            Ok(true) => {
                fixed += 1;
                continue;
            }
            Ok(false) => {}
            Err(e) => log::warn!("Embed extract failed for {}: {}", name, e),
        }

        // Fall back to MusicBrainz API
        let (artist, album, _) = read_metadata(dir);
        match (artist, album) {
            (Some(a), Some(b)) => match fetch_from_musicbrainz(&a, &b, dir) {
                Ok(()) => fixed += 1,
                Err(e) => {
                    errors.push(format!("{}: {}", name, e));
                    failed += 1;
                }
            },
            _ => {
                errors.push(format!("{}: no artist/album tags", name));
                failed += 1;
            }
        }
    }

    let _ = app.emit(
        "albumart-progress",
        AlbumArtProgress {
            total,
            completed: fixed + already_ok + failed,
            current_album: String::new(),
            phase: "done".to_string(),
        },
    );

    AlbumArtResult {
        total,
        fixed,
        already_ok,
        failed,
        cancelled,
        errors,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn is_audio_mp3() {
        assert!(is_audio(&PathBuf::from("song.mp3")));
    }

    #[test]
    fn is_audio_flac_uppercase() {
        assert!(is_audio(&PathBuf::from("track.FLAC")));
    }

    #[test]
    fn is_audio_all_formats() {
        for ext in AUDIO_EXT {
            assert!(is_audio(&PathBuf::from(format!("file.{}", ext))));
        }
    }

    #[test]
    fn is_audio_not_text() {
        assert!(!is_audio(&PathBuf::from("readme.txt")));
    }

    #[test]
    fn is_audio_no_extension() {
        assert!(!is_audio(&PathBuf::from("Makefile")));
    }

    #[test]
    fn is_audio_double_extension() {
        // "file.mp3.bak" has extension "bak", not "mp3"
        assert!(!is_audio(&PathBuf::from("file.mp3.bak")));
    }
}
