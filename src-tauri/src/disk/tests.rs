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
