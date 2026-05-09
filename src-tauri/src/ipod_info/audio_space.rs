use std::fs;
use std::path::Path;

use super::sysinfo::find_ipod_control;

const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "flac", "m4a", "ogg", "opus", "wav", "aiff", "aif", "wma", "ape", "mpc",
];

const ROCKBOX_MAGIC_V10: i32 = 0x5443_4810;
const ROCKBOX_MAGIC_V0F: i32 = 0x5443_480F;

pub fn calculate_audio_space(mount_point: &str) -> u64 {
    let root = Path::new(mount_point);
    let mut total: u64 = 0;
    let mut visited = std::collections::HashSet::new();

    // Check common music directories (deduplicate for case-insensitive filesystems)
    let music_dirs = ["Music", "MUSIC", "music"];
    for dir_name in &music_dirs {
        let dir = root.join(dir_name);
        if dir.is_dir() {
            if let Ok(canonical) = dir.canonicalize() {
                if visited.insert(canonical) {
                    total += walk_audio_bytes(&dir);
                }
            }
        }
    }

    // Also check iPod_Control/Music if it exists
    if let Some(ipod_control) = find_ipod_control(mount_point) {
        let ipod_music = ipod_control.join("Music");
        if ipod_music.is_dir() {
            if let Ok(canonical) = ipod_music.canonicalize() {
                if visited.insert(canonical) {
                    total += walk_audio_bytes(&ipod_music);
                }
            }
        }
    }

    total
}

fn walk_audio_bytes(dir: &Path) -> u64 {
    let mut total: u64 = 0;
    let walker = match fs::read_dir(dir) {
        Ok(w) => w,
        Err(_) => return 0,
    };

    for entry in walker.flatten() {
        let path = entry.path();
        if path.is_dir() {
            total += walk_audio_bytes(&path);
        } else if is_audio_file(&path) {
            if let Ok(meta) = entry.metadata() {
                total += meta.len();
            }
        }
    }

    total
}

fn is_audio_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| {
            let lower = ext.to_ascii_lowercase();
            AUDIO_EXTENSIONS.contains(&lower.as_str())
        })
}

pub fn quick_rockbox_track_count(mount_point: &str) -> Option<usize> {
    let idx_path = Path::new(mount_point)
        .join(".rockbox")
        .join("database_idx.tcd");

    let data = fs::read(idx_path).ok()?;
    if data.len() < 24 {
        return None;
    }

    let magic = i32::from_le_bytes([data[0], data[1], data[2], data[3]]);
    if magic != ROCKBOX_MAGIC_V10 && magic != ROCKBOX_MAGIC_V0F {
        return None;
    }

    let entry_count = i32::from_le_bytes([data[8], data[9], data[10], data[11]]);
    if entry_count < 0 {
        return None;
    }

    Some(entry_count as usize)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_audio_file() {
        assert!(is_audio_file(Path::new("song.mp3")));
        assert!(is_audio_file(Path::new("song.FLAC")));
        assert!(is_audio_file(Path::new("track.m4a")));
        assert!(is_audio_file(Path::new("file.ogg")));
        assert!(!is_audio_file(Path::new("image.jpg")));
        assert!(!is_audio_file(Path::new("doc.txt")));
        assert!(!is_audio_file(Path::new("noext")));
    }

    #[test]
    fn test_quick_rockbox_track_count_invalid_data() {
        assert!(quick_rockbox_track_count("/nonexistent").is_none());
    }

    #[test]
    fn test_calculate_audio_space_with_files() {
        let dir = tempfile::tempdir().unwrap();
        let music_dir = dir.path().join("Music");
        fs::create_dir_all(&music_dir).unwrap();

        fs::write(music_dir.join("song.mp3"), vec![0u8; 1000]).unwrap();
        fs::write(music_dir.join("track.flac"), vec![0u8; 2000]).unwrap();
        fs::write(music_dir.join("cover.jpg"), vec![0u8; 500]).unwrap();

        let total = calculate_audio_space(dir.path().to_str().unwrap());
        assert_eq!(total, 3000);
    }

    #[test]
    fn test_calculate_audio_space_empty() {
        let dir = tempfile::tempdir().unwrap();
        let total = calculate_audio_space(dir.path().to_str().unwrap());
        assert_eq!(total, 0);
    }

    #[test]
    fn test_walk_audio_bytes_recursive() {
        let dir = tempfile::tempdir().unwrap();
        let sub = dir.path().join("artist").join("album");
        fs::create_dir_all(&sub).unwrap();
        fs::write(sub.join("01.mp3"), vec![0u8; 500]).unwrap();
        fs::write(sub.join("02.flac"), vec![0u8; 800]).unwrap();

        let total = walk_audio_bytes(dir.path());
        assert_eq!(total, 1300);
    }
}
