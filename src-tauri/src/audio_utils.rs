use rayon::prelude::*;
use std::fs;
use std::path::{Path, PathBuf};
use unicode_normalization::UnicodeNormalization;

pub const AUDIO_EXT: &[&str] = &[
    "mp3", "flac", "m4a", "ogg", "opus", "wav", "aiff", "wma", "aac",
];

pub fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXT.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// Normalize a path string to Unicode NFC form.
/// macOS can produce NFD (decomposed) paths where e.g. "á" is stored as
/// two codepoints (U+0061 + U+0301). This causes duplicate DB entries when
/// the same file is referenced via NFC and NFD paths. Normalizing to NFC
/// ensures a single canonical representation.
pub fn normalize_path(path: &Path) -> PathBuf {
    PathBuf::from(path.to_string_lossy().nfc().collect::<String>())
}

pub fn collect_audio_files(dir: &Path, files: &mut Vec<PathBuf>) {
    files.extend(walk_dir(dir));
}

fn walk_dir(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };

    let mut files = Vec::new();
    let mut dirs = Vec::new();

    for entry in entries.filter_map(|e| e.ok()) {
        let path = normalize_path(&entry.path());
        if path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.starts_with('.'))
            .unwrap_or(false)
        {
            continue;
        }
        // file_type() comes free from readdir; only symlinks need a stat
        // (path.is_dir() follows them, keeping symlinked folders walkable).
        let is_dir = match entry.file_type() {
            Ok(t) if t.is_symlink() => path.is_dir(),
            Ok(t) => t.is_dir(),
            Err(_) => false,
        };
        if is_dir {
            dirs.push(path);
        } else if is_audio(&path) {
            files.push(path);
        }
    }

    dirs.sort();
    // par_iter preserves order, so results are identical to the sequential walk.
    let subtrees: Vec<Vec<PathBuf>> = dirs.par_iter().map(|d| walk_dir(d)).collect();
    for subtree in subtrees {
        files.extend(subtree);
    }
    files
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_audio_recognizes_formats() {
        assert!(is_audio(Path::new("song.mp3")));
        assert!(is_audio(Path::new("song.FLAC")));
        assert!(is_audio(Path::new("song.m4a")));
        assert!(is_audio(Path::new("song.ogg")));
        assert!(is_audio(Path::new("song.opus")));
        assert!(is_audio(Path::new("song.wav")));
        assert!(is_audio(Path::new("song.aiff")));
        assert!(!is_audio(Path::new("cover.jpg")));
        assert!(!is_audio(Path::new("notes.txt")));
    }
}
