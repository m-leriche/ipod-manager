use lofty::picture::PictureType;
use lofty::prelude::{Accessor, TaggedFileExt};
use lofty::probe::Probe;
use serde::Serialize;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

const AUDIO_EXT: &[&str] = &[
    "mp3", "flac", "m4a", "ogg", "opus", "wav", "aiff", "wma", "aac",
];

const COVER_NAMES: &[&str] = &[
    "cover.jpg", "cover.jpeg", "cover.png", "cover.bmp", "folder.jpg", "folder.jpeg",
    "album.jpg", "album.jpeg", "front.jpg", "front.jpeg",
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
    let Ok(entries) = fs::read_dir(dir) else { return false };
    let names: Vec<String> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().to_lowercase())
        .collect();
    COVER_NAMES.iter().any(|c| names.contains(&(*c).to_string()))
}

/// Read artist, album, and embedded-art presence from the first parseable audio file.
fn read_metadata(dir: &Path) -> (Option<String>, Option<String>, bool) {
    let Ok(entries) = fs::read_dir(dir) else { return (None, None, false) };

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if !is_audio(&path) {
            continue;
        }
        let Ok(probe) = Probe::open(&path) else { continue };
        let Ok(tagged) = probe.read() else { continue };
        let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) else { continue };

        return (
            tag.artist().map(|s| s.to_string()),
            tag.album().map(|s| s.to_string()),
            !tag.pictures().is_empty(),
        );
    }
    (None, None, false)
}

// ── Scanning ──────────────────────────────────────────────────────

fn scan_dir(dir: &Path, albums: &mut Vec<AlbumInfo>, app: &AppHandle) {
    let Ok(entries) = fs::read_dir(dir) else { return };

    let mut audio_count = 0usize;
    let mut subdirs = Vec::new();

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if entry.file_name().to_string_lossy().starts_with('.') {
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
        scan_dir(&sub, albums, app);
    }
}

pub fn scan_albums(music_path: &str, app: AppHandle) -> Result<Vec<AlbumInfo>, String> {
    let root = Path::new(music_path)
        .canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;

    let mut albums = Vec::new();
    scan_dir(&root, &mut albums, &app);

    // Missing art first, then alphabetical by artist/album
    albums.sort_by(|a, b| {
        a.has_cover_file.cmp(&b.has_cover_file).then_with(|| {
            let aa = a.artist.as_deref().unwrap_or("");
            let ba = b.artist.as_deref().unwrap_or("");
            aa.to_lowercase()
                .cmp(&ba.to_lowercase())
                .then_with(|| {
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
        let Ok(probe) = Probe::open(&path) else { continue };
        let Ok(tagged) = probe.read() else { continue };
        let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) else { continue };

        // Prefer front cover, fall back to any picture
        let pic = tag
            .pictures()
            .iter()
            .find(|p| p.pic_type() == PictureType::CoverFront)
            .or_else(|| tag.pictures().first());

        let Some(pic) = pic else { continue };

        let img = image::load_from_memory(pic.data())
            .map_err(|e| format!("Decode failed: {}", e))?;

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

/// Fetch cover art from the MusicBrainz Cover Art Archive.
fn fetch_from_musicbrainz(artist: &str, album: &str, dir: &Path) -> Result<(), String> {
    let query = format!(
        "artist:\"{}\" AND release:\"{}\"",
        artist.replace('"', "\\\""),
        album.replace('"', "\\\""),
    );

    let resp = ureq::get("https://musicbrainz.org/ws/2/release/")
        .query("query", &query)
        .query("fmt", "json")
        .query("limit", "5")
        .set("User-Agent", "iPodManager/1.0 (ipod-manager-app)")
        .call()
        .map_err(|e| format!("Search failed: {}", e))?;

    let body: serde_json::Value = {
        let text = resp.into_string().map_err(|e| format!("Read failed: {}", e))?;
        serde_json::from_str(&text).map_err(|e| format!("Parse failed: {}", e))?
    };

    let releases = body["releases"]
        .as_array()
        .ok_or_else(|| "No results from MusicBrainz".to_string())?;

    for release in releases {
        let Some(mbid) = release["id"].as_str() else { continue };

        let url = format!("https://coverartarchive.org/release/{}/front-500", mbid);
        let Ok(img_resp) = ureq::get(&url)
            .set("User-Agent", "iPodManager/1.0 (ipod-manager-app)")
            .call()
        else {
            continue;
        };

        let mut bytes = Vec::new();
        if img_resp.into_reader().read_to_end(&mut bytes).is_err() {
            continue;
        }

        let Ok(img) = image::load_from_memory(&bytes) else { continue };

        let img = if img.width() > 600 || img.height() > 600 {
            img.resize(600, 600, image::imageops::FilterType::Lanczos3)
        } else {
            img
        };

        img.save(dir.join("cover.jpg"))
            .map_err(|e| format!("Save failed: {}", e))?;

        return Ok(());
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

        if has_cover(dir) {
            already_ok += 1;
            continue;
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
            (Some(a), Some(b)) => {
                // MusicBrainz rate limit: 1 request/sec
                std::thread::sleep(std::time::Duration::from_secs(1));
                match fetch_from_musicbrainz(&a, &b, dir) {
                    Ok(()) => fixed += 1,
                    Err(e) => {
                        errors.push(format!("{}: {}", name, e));
                        failed += 1;
                    }
                }
            }
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
