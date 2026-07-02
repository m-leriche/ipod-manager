use std::fs;
use std::io;
use std::path::Path;

use trash::macos::{DeleteMethod, TrashContextExtMacos};
use trash::TrashContext;

/// Whether a path should go to the macOS Trash instead of being deleted
/// permanently. Only root-volume paths qualify: on external/removable
/// volumes (mounted under /Volumes/ — e.g. a FAT32 iPod), trashing creates
/// a hidden .Trashes folder on the device and does NOT free space, which
/// defeats the point of deleting on an iPod.
fn should_use_trash(path: &Path) -> bool {
    !path.starts_with("/Volumes")
}

/// Delete a file or directory: move it to the Trash on the root volume,
/// delete permanently on external volumes (see `should_use_trash`).
/// Test builds always delete permanently so `cargo test` stays hermetic
/// and doesn't fill the developer's Trash with tempdir fixtures.
pub fn trash_or_delete(path: &Path) -> Result<(), String> {
    if !cfg!(test) && should_use_trash(path) {
        return move_to_trash(path).map_err(|e| format!("Move to Trash failed: {}", e));
    }
    remove_permanently(path).map_err(|e| e.to_string())
}

/// Move to the Trash via `NSFileManager` (`trashItemAtURL`) rather than the
/// crate's default Finder/AppleScript method. The Finder method spawns an
/// `osascript` process per call and needs Apple Events automation consent —
/// a denied TCC prompt would make every delete fail. `NSFileManager` is
/// silent, requires no automation permission, and avoids the process spawn.
fn move_to_trash(path: &Path) -> Result<(), trash::Error> {
    let mut ctx = TrashContext::default();
    ctx.set_delete_method(DeleteMethod::NsFileManager);
    ctx.delete(path)
}

fn remove_permanently(path: &Path) -> io::Result<()> {
    if path.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    }
}

#[cfg(test)]
mod tests {
    use super::should_use_trash;
    use std::path::Path;

    #[test]
    fn root_volume_paths_use_trash() {
        assert!(should_use_trash(Path::new("/Users/me/Music/song.mp3")));
        assert!(should_use_trash(Path::new("/private/tmp/album")));
    }

    #[test]
    fn external_volume_paths_delete_permanently() {
        assert!(!should_use_trash(Path::new("/Volumes/IPOD/Music/song.mp3")));
        assert!(!should_use_trash(Path::new("/Volumes/USB")));
    }

    #[test]
    fn volumes_prefix_matches_whole_component_only() {
        assert!(should_use_trash(Path::new("/VolumesBackup/song.mp3")));
    }
}
