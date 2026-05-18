mod detection;
mod mount;
#[cfg(test)]
mod tests;

use serde::{Deserialize, Serialize};

pub use detection::detect_ipod_disk;
pub use mount::{mount_ipod_disk, unmount_ipod_disk, DEFAULT_MOUNT_POINT};

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
