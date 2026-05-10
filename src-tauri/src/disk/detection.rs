use std::path::Path;
use std::process::Command;

use super::{format_bytes, DiskInfo, DiskutilInfo, DiskutilList};

/// Find an iPod among external FAT32 partitions.
///
/// Uses `diskutil list -plist` for structured enumeration, then
/// `diskutil info -plist` for each partition's details.
///
/// Picks the best iPod candidate:
/// 1. USB device recognized as iPod by macOS (media_name contains "ipod")
/// 2. Mounted partition with `iPod_Control/` or `.rockbox/`
/// 3. First FAT32 partition (fallback)
pub fn detect_ipod_disk() -> Result<Option<DiskInfo>, String> {
    let candidates = find_fat32_partitions()?;
    if candidates.is_empty() {
        return Ok(None);
    }

    // Priority 1: USB device recognized as iPod by macOS (works before mounting)
    for info in &candidates {
        if info
            .media_name
            .as_deref()
            .is_some_and(|n| n.to_ascii_lowercase().contains("ipod"))
        {
            return Ok(Some(info.clone()));
        }
    }

    // Priority 2: Mounted partition with iPod_Control/ or .rockbox/
    for info in &candidates {
        if let Some(ref mp) = info.mount_point {
            if is_ipod_filesystem(mp) {
                return Ok(Some(info.clone()));
            }
        }
    }

    // Priority 3: Fall back to first FAT32 partition
    Ok(candidates.into_iter().next())
}

/// Check if a mounted filesystem looks like an iPod (has iPod_Control/ or .rockbox/).
fn is_ipod_filesystem(mount_point: &str) -> bool {
    let root = Path::new(mount_point);

    if root.join(".rockbox").is_dir() {
        return true;
    }

    if let Ok(entries) = std::fs::read_dir(root) {
        for entry in entries.flatten() {
            if entry
                .file_name()
                .to_string_lossy()
                .eq_ignore_ascii_case("iPod_Control")
                && entry.path().is_dir()
            {
                return true;
            }
        }
    }

    false
}

/// Enumerate external FAT32 partitions via `diskutil list -plist`.
fn find_fat32_partitions() -> Result<Vec<DiskInfo>, String> {
    let output = Command::new("diskutil")
        .args(["list", "-plist", "external", "physical"])
        .output()
        .map_err(|e| format!("Failed to run diskutil: {e}"))?;

    if !output.status.success() {
        return Ok(Vec::new());
    }

    let list: DiskutilList = plist::from_bytes(&output.stdout)
        .map_err(|e| format!("Failed to parse diskutil plist: {e}"))?;

    let mut results = Vec::new();

    for disk in &list.all_disks_and_partitions {
        for partition in &disk.partitions {
            if partition.content == "DOS_FAT_32" || partition.content == "Windows_FAT_32" {
                if let Some(info) = get_partition_info(&partition.device_identifier) {
                    results.push(info);
                }
            }
        }
    }

    Ok(results)
}

/// Get full partition details via `diskutil info -plist <identifier>`.
fn get_partition_info(identifier: &str) -> Option<DiskInfo> {
    let output = Command::new("diskutil")
        .args(["info", "-plist", identifier])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let info: DiskutilInfo = plist::from_bytes(&output.stdout).ok()?;

    let mount_point = if info.mount_point.is_empty() {
        None
    } else {
        Some(info.mount_point)
    };

    let total_space = if info.iokit_size > 0 {
        Some(info.iokit_size)
    } else {
        None
    };

    let (free_space, used_space) = match (total_space, info.free_space) {
        (Some(total), Some(free)) => (Some(free), Some(total - free)),
        _ => (None, None),
    };

    let media_name = get_parent_media_name(&info.parent_whole_disk);

    Some(DiskInfo {
        identifier: info.device_identifier,
        size: format_bytes(info.iokit_size),
        name: if info.volume_name.is_empty() {
            String::new()
        } else {
            info.volume_name
        },
        mounted: mount_point.is_some(),
        mount_point,
        free_space,
        used_space,
        total_space,
        media_name,
    })
}

/// Get the parent disk's media name via `diskutil info -plist`.
fn get_parent_media_name(parent_identifier: &str) -> Option<String> {
    if parent_identifier.is_empty() {
        return None;
    }

    let output = Command::new("diskutil")
        .args(["info", "-plist", parent_identifier])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let info: DiskutilInfo = plist::from_bytes(&output.stdout).ok()?;

    if info.media_name.is_empty() {
        None
    } else {
        Some(info.media_name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_ipod_filesystem_empty_dir() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(!is_ipod_filesystem(tmp.path().to_str().unwrap()));
    }

    #[test]
    fn is_ipod_filesystem_with_rockbox() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir(tmp.path().join(".rockbox")).unwrap();
        assert!(is_ipod_filesystem(tmp.path().to_str().unwrap()));
    }

    #[test]
    fn is_ipod_filesystem_with_ipod_control() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir(tmp.path().join("iPod_Control")).unwrap();
        assert!(is_ipod_filesystem(tmp.path().to_str().unwrap()));
    }

    #[test]
    fn is_ipod_filesystem_nonexistent_path() {
        assert!(!is_ipod_filesystem("/this/does/not/exist/12345"));
    }
}
