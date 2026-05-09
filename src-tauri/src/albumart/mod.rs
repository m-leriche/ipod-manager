mod fixer;
mod scanner;

use serde::Serialize;
use std::path::Path;

pub const AUDIO_EXT: &[&str] = &[
    "mp3", "flac", "m4a", "ogg", "opus", "wav", "aiff", "wma", "aac",
];

pub const COVER_NAMES: &[&str] = &[
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

// ── Shared Helpers ──────────────────────────────────────────────

pub fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXT.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

pub fn has_cover(dir: &Path) -> bool {
    find_cover(dir).is_some()
}

/// Find the first existing cover art file in a directory.
pub fn find_cover(dir: &Path) -> Option<std::path::PathBuf> {
    let Ok(entries) = std::fs::read_dir(dir) else {
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

/// Resize an image to 600x600 if oversized, to save iPod storage.
pub fn resize_if_needed(img: image::DynamicImage) -> image::DynamicImage {
    if img.width() > 600 || img.height() > 600 {
        img.resize(600, 600, image::imageops::FilterType::Lanczos3)
    } else {
        img
    }
}

// ── Public API (re-exports) ─────────────────────────────────────

pub use fixer::{fix_album_art, save_uploaded_cover};
pub use scanner::scan_albums;

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
        assert!(!is_audio(&PathBuf::from("file.mp3.bak")));
    }

    #[test]
    fn has_cover_returns_false_for_empty_dir() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(!has_cover(tmp.path()));
    }

    #[test]
    fn has_cover_returns_true_for_cover_jpg() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("cover.jpg"), "fake").unwrap();
        assert!(has_cover(tmp.path()));
    }

    #[test]
    fn has_cover_detects_variant_names() {
        for name in &["folder.jpg", "album.jpg", "front.jpg", "cover.png"] {
            let tmp = tempfile::tempdir().unwrap();
            std::fs::write(tmp.path().join(name), "fake").unwrap();
            assert!(has_cover(tmp.path()), "should detect {}", name);
        }
    }

    #[test]
    fn has_cover_case_insensitive() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("Cover.JPG"), "fake").unwrap();
        assert!(has_cover(tmp.path()));
    }

    #[test]
    fn has_cover_nonexistent_dir() {
        assert!(!has_cover(Path::new("/this/does/not/exist")));
    }
}
