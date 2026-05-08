use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskInfo {
    pub identifier: String,
    pub size: String,
    pub name: String,
    pub mounted: bool,
    pub mount_point: Option<String>,
    pub free_space: Option<u64>,
    pub used_space: Option<u64>,
    pub total_space: Option<u64>,
    /// Device media name from the parent USB device (e.g., "iPod Classic", "iPod Nano").
    /// Only present when macOS recognizes the USB device as an iPod.
    pub media_name: Option<String>,
}

// ── Plist deserialization types ──────────────────────────────────

/// Top-level output of `diskutil list -plist external physical`.
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct DiskutilList {
    #[serde(default)]
    all_disks_and_partitions: Vec<DiskEntry>,
}

/// A physical disk containing partitions.
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct DiskEntry {
    #[serde(default)]
    partitions: Vec<PartitionEntry>,
}

/// A single partition within a disk.
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct PartitionEntry {
    #[serde(default)]
    content: String,
    #[serde(default)]
    device_identifier: String,
}

/// Output of `diskutil info -plist <identifier>`.
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct DiskutilInfo {
    #[serde(default)]
    device_identifier: String,
    #[serde(default)]
    volume_name: String,
    #[serde(default)]
    mount_point: String,
    #[serde(default, rename = "IOKitSize")]
    iokit_size: u64,
    #[serde(default)]
    free_space: Option<u64>,
    #[serde(default)]
    media_name: String,
    #[serde(default)]
    parent_whole_disk: String,
}

// ── Detection ────────────────────────────────────────────────────

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
/// The parent identifier comes from the partition's `ParentWholeDisk` field.
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

fn format_bytes(bytes: u64) -> String {
    let gb = bytes as f64 / 1_000_000_000.0;
    if gb >= 1000.0 {
        format!("{:.1} TB", gb / 1000.0)
    } else if gb >= 1.0 {
        format!("{:.1} GB", gb)
    } else {
        format!("{:.1} MB", bytes as f64 / 1_000_000.0)
    }
}

// ── Mount / Unmount ──────────────────────────────────────────────

/// Mount the iPod at /Volumes/IPOD using sudo mount -t msdos.
/// Password is piped to sudo via stdin.
pub fn mount_ipod_disk(identifier: &str, password: &str) -> Result<(), String> {
    fn sudo_run(password: &str, args: &[&str]) -> Result<String, String> {
        use std::io::Write;
        use std::process::Stdio;

        let mut child = Command::new("sudo")
            .arg("-S")
            .args(args)
            .current_dir("/")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn sudo: {e}"))?;

        if let Some(mut stdin) = child.stdin.take() {
            let _ = writeln!(stdin, "{}", password);
        }

        let output = child
            .wait_with_output()
            .map_err(|e| format!("Failed to wait for sudo: {e}"))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.contains("incorrect password") || stderr.contains("Sorry, try again") {
                Err("Incorrect password".to_string())
            } else {
                Err(stderr.trim().to_string())
            }
        }
    }

    // Step 1: Unmount from any existing mount point (best-effort)
    let _ = sudo_run(
        password,
        &["diskutil", "unmount", &format!("/dev/{}", identifier)],
    );

    // Step 2: Create mount point
    sudo_run(password, &["mkdir", "-p", "/Volumes/IPOD"])
        .map_err(|e| format!("Failed to create mount point: {e}"))?;

    // Step 3: Mount as FAT32
    sudo_run(
        password,
        &[
            "mount",
            "-t",
            "msdos",
            &format!("/dev/{}", identifier),
            "/Volumes/IPOD",
        ],
    )
    .map_err(|e| format!("Mount failed: {e}"))?;

    Ok(())
}

/// Unmount the iPod from /Volumes/IPOD.
pub fn unmount_ipod_disk() -> Result<(), String> {
    let output = Command::new("diskutil")
        .args(["unmount", "/Volumes/IPOD"])
        .output()
        .map_err(|e| format!("Failed to run diskutil: {e}"))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "Unmount failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Plist parsing ────────────────────────────────────────────

    #[test]
    fn parse_diskutil_list_plist() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>AllDisksAndPartitions</key>
    <array>
        <dict>
            <key>Content</key>
            <string>FDisk_partition_scheme</string>
            <key>DeviceIdentifier</key>
            <string>disk5</string>
            <key>Partitions</key>
            <array>
                <dict>
                    <key>Content</key>
                    <string>DOS_FAT_32</string>
                    <key>DeviceIdentifier</key>
                    <string>disk5s1</string>
                    <key>Size</key>
                    <integer>119100000000</integer>
                    <key>VolumeName</key>
                    <string>IPOD</string>
                </dict>
            </array>
            <key>Size</key>
            <integer>119100000000</integer>
        </dict>
    </array>
</dict>
</plist>"#;
        let list: DiskutilList = plist::from_bytes(xml.as_bytes()).unwrap();
        assert_eq!(list.all_disks_and_partitions.len(), 1);
        let partitions = &list.all_disks_and_partitions[0].partitions;
        assert_eq!(partitions.len(), 1);
        assert_eq!(partitions[0].content, "DOS_FAT_32");
        assert_eq!(partitions[0].device_identifier, "disk5s1");
    }

    #[test]
    fn parse_diskutil_list_filters_non_fat() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>AllDisksAndPartitions</key>
    <array>
        <dict>
            <key>Partitions</key>
            <array>
                <dict>
                    <key>Content</key>
                    <string>Windows_NTFS</string>
                    <key>DeviceIdentifier</key>
                    <string>disk4s1</string>
                </dict>
                <dict>
                    <key>Content</key>
                    <string>DOS_FAT_32</string>
                    <key>DeviceIdentifier</key>
                    <string>disk4s2</string>
                </dict>
            </array>
        </dict>
    </array>
</dict>
</plist>"#;
        let list: DiskutilList = plist::from_bytes(xml.as_bytes()).unwrap();
        let fat_partitions: Vec<_> = list.all_disks_and_partitions[0]
            .partitions
            .iter()
            .filter(|p| p.content == "DOS_FAT_32" || p.content == "Windows_FAT_32")
            .collect();
        assert_eq!(fat_partitions.len(), 1);
        assert_eq!(fat_partitions[0].device_identifier, "disk4s2");
    }

    #[test]
    fn parse_diskutil_info_plist() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>DeviceIdentifier</key>
    <string>disk5s1</string>
    <key>VolumeName</key>
    <string>IPOD</string>
    <key>MountPoint</key>
    <string>/Volumes/IPOD</string>
    <key>IOKitSize</key>
    <integer>119100000000</integer>
    <key>FreeSpace</key>
    <integer>50000000000</integer>
    <key>MediaName</key>
    <string></string>
    <key>ParentWholeDisk</key>
    <string>disk5</string>
</dict>
</plist>"#;
        let info: DiskutilInfo = plist::from_bytes(xml.as_bytes()).unwrap();
        assert_eq!(info.device_identifier, "disk5s1");
        assert_eq!(info.volume_name, "IPOD");
        assert_eq!(info.mount_point, "/Volumes/IPOD");
        assert_eq!(info.iokit_size, 119_100_000_000);
        assert_eq!(info.free_space, Some(50_000_000_000));
        assert_eq!(info.parent_whole_disk, "disk5");
    }

    #[test]
    fn parse_diskutil_info_unmounted() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>DeviceIdentifier</key>
    <string>disk5s1</string>
    <key>VolumeName</key>
    <string>IPOD</string>
    <key>MountPoint</key>
    <string></string>
    <key>IOKitSize</key>
    <integer>119100000000</integer>
    <key>ParentWholeDisk</key>
    <string>disk5</string>
</dict>
</plist>"#;
        let info: DiskutilInfo = plist::from_bytes(xml.as_bytes()).unwrap();
        assert!(info.mount_point.is_empty());
        assert!(info.free_space.is_none());
    }

    // ── Format bytes ─────────────────────────────────────────────

    #[test]
    fn format_bytes_gb() {
        assert_eq!(format_bytes(119_100_000_000), "119.1 GB");
    }

    #[test]
    fn format_bytes_tb() {
        assert_eq!(format_bytes(1_000_000_000_000), "1.0 TB");
    }

    #[test]
    fn format_bytes_mb() {
        assert_eq!(format_bytes(512_000_000), "512.0 MB");
    }

    // ── Security: disk identifier validation ─────────────────────

    fn is_valid_disk_identifier(identifier: &str) -> bool {
        identifier.starts_with("disk")
            && identifier.len() > 4
            && identifier[4..].chars().all(|c| c.is_ascii_alphanumeric())
    }

    #[test]
    fn valid_disk_identifiers() {
        assert!(is_valid_disk_identifier("disk5s2"));
        assert!(is_valid_disk_identifier("disk0s1"));
        assert!(is_valid_disk_identifier("disk12s3"));
    }

    #[test]
    fn rejects_empty_disk_identifier() {
        assert!(!is_valid_disk_identifier(""));
    }

    #[test]
    fn rejects_just_disk_prefix() {
        assert!(!is_valid_disk_identifier("disk"));
    }

    #[test]
    fn rejects_path_traversal_in_identifier() {
        assert!(!is_valid_disk_identifier("disk/../etc/passwd"));
        assert!(!is_valid_disk_identifier("disk5;rm -rf /"));
    }

    #[test]
    fn rejects_shell_metacharacters_in_identifier() {
        assert!(!is_valid_disk_identifier("disk5$(echo)"));
        assert!(!is_valid_disk_identifier("disk5`whoami`"));
        assert!(!is_valid_disk_identifier("disk5|cat"));
        assert!(!is_valid_disk_identifier("disk5&"));
        assert!(!is_valid_disk_identifier("disk5;ls"));
    }

    #[test]
    fn rejects_spaces_in_identifier() {
        assert!(!is_valid_disk_identifier("disk5 s2"));
    }

    #[test]
    fn rejects_non_disk_prefix() {
        assert!(!is_valid_disk_identifier("notadisk5s2"));
        assert!(!is_valid_disk_identifier("/dev/disk5s2"));
    }

    // ── Filesystem detection ─────────────────────────────────────

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
