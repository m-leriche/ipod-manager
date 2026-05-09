use lofty::picture::PictureType;
use lofty::prelude::{Accessor, TaggedFileExt};
use lofty::probe::Probe;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

use super::{find_cover, is_audio, resize_if_needed, AlbumArtProgress, AlbumArtResult};

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

    let img = image::open(&existing)
        .map_err(|e| format!("Failed to read {}: {}", existing.display(), e))?;
    img.save(&cover_jpg)
        .map_err(|e| format!("Failed to save cover.jpg: {}", e))?;

    Ok(true)
}

/// Read artist and album from the first parseable audio file in a directory.
fn read_album_metadata(dir: &Path) -> (Option<String>, Option<String>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return (None, None);
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
        );
    }
    (None, None)
}

/// Extract embedded album art from the first audio file that has it -> cover.jpg
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

        let pic = tag
            .pictures()
            .iter()
            .find(|p| p.pic_type() == PictureType::CoverFront)
            .or_else(|| tag.pictures().first());

        let Some(pic) = pic else { continue };

        let img =
            image::load_from_memory(pic.data()).map_err(|e| format!("Decode failed: {}", e))?;
        let img = resize_if_needed(img);

        img.save(dir.join("cover.jpg"))
            .map_err(|e| format!("Save failed: {}", e))?;

        return Ok(true);
    }
    Ok(false)
}

/// Try to download and save cover art from a list of MusicBrainz releases.
fn try_save_cover(
    releases: &[crate::musicbrainz::MbRelease],
    dir: &Path,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<(), String> {
    for release in releases {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err("Cancelled".into());
        }

        let Ok(bytes) = crate::musicbrainz::fetch_cover_art(&release.id) else {
            continue;
        };
        let Ok(img) = image::load_from_memory(&bytes) else {
            continue;
        };

        let img = resize_if_needed(img);
        img.save(dir.join("cover.jpg"))
            .map_err(|e| format!("Save failed: {}", e))?;

        return Ok(());
    }

    Err("No cover art found".into())
}

/// Fetch cover art from the MusicBrainz Cover Art Archive.
/// Tries exact names first, then retries with normalized names (stripping
/// disc indicators, edition markers, remaster tags, etc.).
fn fetch_from_musicbrainz(
    artist: &str,
    album: &str,
    dir: &Path,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<(), String> {
    if cancel_flag.load(Ordering::SeqCst) {
        return Err("Cancelled".into());
    }

    // Attempt 1: exact names
    if let Ok(releases) = crate::musicbrainz::search_releases(artist, album) {
        if !releases.is_empty() && try_save_cover(&releases, dir, cancel_flag).is_ok() {
            return Ok(());
        }
    }

    if cancel_flag.load(Ordering::SeqCst) {
        return Err("Cancelled".into());
    }

    // Attempt 2+3: normalized album/artist names
    let clean_album = crate::musicbrainz::normalize_for_search(album);
    let clean_artist = crate::musicbrainz::normalize_for_search(artist);
    let album_changed = clean_album != album;
    let artist_changed = clean_artist != artist;

    if album_changed {
        if let Ok(releases) = crate::musicbrainz::search_releases(artist, &clean_album) {
            if !releases.is_empty() && try_save_cover(&releases, dir, cancel_flag).is_ok() {
                return Ok(());
            }
        }
    }

    if cancel_flag.load(Ordering::SeqCst) {
        return Err("Cancelled".into());
    }

    if artist_changed && album_changed {
        if let Ok(releases) = crate::musicbrainz::search_releases(&clean_artist, &clean_album) {
            if !releases.is_empty() && try_save_cover(&releases, dir, cancel_flag).is_ok() {
                return Ok(());
            }
        }
    } else if artist_changed {
        if let Ok(releases) = crate::musicbrainz::search_releases(&clean_artist, album) {
            if !releases.is_empty() && try_save_cover(&releases, dir, cancel_flag).is_ok() {
                return Ok(());
            }
        }
    }

    Err("No cover art found on MusicBrainz".into())
}

/// Invalidate cached thumbnails for a folder after album art changes.
fn invalidate_thumbnails(app: &AppHandle, folder_path: &str) {
    if let Ok(cache_dir) = app.path().app_data_dir().map(|d| d.join("thumbnails")) {
        crate::thumbnail::invalidate(&cache_dir, folder_path);
    }
}

/// Fix album art for a list of folders.
/// Tries embedded extraction first (fast, no network), then MusicBrainz.
pub fn fix_album_art(
    folders: Vec<String>,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
    event_name: &str,
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
            event_name,
            AlbumArtProgress {
                total,
                completed: i,
                current_album: name.clone(),
                phase: "processing".to_string(),
            },
        );

        match normalize_cover(dir) {
            Ok(true) => {
                already_ok += 1;
                continue;
            }
            Ok(false) => {}
            Err(e) => log::warn!("Cover normalize failed for {}: {}", name, e),
        }

        match extract_embedded(dir) {
            Ok(true) => {
                fixed += 1;
                invalidate_thumbnails(&app, folder_str);
                let _ = app.emit("album-art-fixed", folder_str.clone());
                continue;
            }
            Ok(false) => {}
            Err(e) => log::warn!("Embed extract failed for {}: {}", name, e),
        }

        let (artist, album) = read_album_metadata(dir);
        match (artist, album) {
            (Some(a), Some(b)) => match fetch_from_musicbrainz(&a, &b, dir, &cancel_flag) {
                Ok(()) => {
                    fixed += 1;
                    invalidate_thumbnails(&app, folder_str);
                    let _ = app.emit("album-art-fixed", folder_str.clone());
                }
                Err(e) if e == "Cancelled" => {
                    cancelled = true;
                    break;
                }
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
        event_name,
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

/// Save a user-provided image file as cover.jpg in the given directory.
pub fn save_uploaded_cover(folder: &str, image_path: &str) -> Result<(), String> {
    let dir = Path::new(folder);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", folder));
    }

    let src = Path::new(image_path);
    if !src.is_file() {
        return Err(format!("File not found: {}", image_path));
    }

    let img = image::open(src).map_err(|e| format!("Failed to load image: {}", e))?;
    let img = resize_if_needed(img);

    img.save(dir.join("cover.jpg"))
        .map_err(|e| format!("Failed to save cover.jpg: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upload_rejects_nonexistent_folder() {
        let result = save_uploaded_cover("/no/such/folder/xyz", "/tmp/image.jpg");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Not a directory"));
    }

    #[test]
    fn upload_rejects_nonexistent_image() {
        let tmp = tempfile::tempdir().unwrap();
        let result = save_uploaded_cover(tmp.path().to_str().unwrap(), "/no/such/image_xyz.jpg");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("File not found"));
    }

    #[test]
    fn upload_rejects_non_image_file() {
        let tmp = tempfile::tempdir().unwrap();
        let text_file = tmp.path().join("not_an_image.txt");
        std::fs::write(&text_file, "this is not an image").unwrap();

        let target_dir = tempfile::tempdir().unwrap();
        let result = save_uploaded_cover(
            target_dir.path().to_str().unwrap(),
            text_file.to_str().unwrap(),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Failed to load image"));
    }

    #[test]
    fn upload_rejects_file_as_folder() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("somefile.txt");
        std::fs::write(&file, "data").unwrap();

        let result = save_uploaded_cover(file.to_str().unwrap(), "/tmp/image.jpg");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Not a directory"));
    }

    #[test]
    fn normalize_cover_returns_false_for_empty_dir() {
        let tmp = tempfile::tempdir().unwrap();
        assert_eq!(normalize_cover(tmp.path()).unwrap(), false);
    }

    #[test]
    fn normalize_cover_returns_true_if_cover_jpg_exists() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("cover.jpg"), "fake jpg data").unwrap();
        assert_eq!(normalize_cover(tmp.path()).unwrap(), true);
    }
}
