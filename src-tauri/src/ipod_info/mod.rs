mod audio_space;
mod models;
mod sysinfo;

use crate::disk::DiskInfo;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct IpodInfo {
    pub volume_name: String,
    pub identifier: String,
    pub mount_point: String,
    pub total_space: u64,
    pub used_space: u64,
    pub free_space: u64,
    pub format: String,

    pub serial_number: Option<String>,
    pub model_number: Option<String>,
    pub model_name: Option<String>,
    pub firmware_version: Option<String>,

    pub rockbox_version: Option<String>,
    pub has_rockbox: bool,

    pub audio_space: u64,
    pub other_space: u64,

    pub rockbox_track_count: Option<usize>,
}

pub fn read_ipod_info(mount_point: &str, disk_info: &DiskInfo) -> Result<IpodInfo, String> {
    let root = std::path::Path::new(mount_point);
    if !root.is_dir() {
        return Err(format!("Mount point does not exist: {}", mount_point));
    }

    let sysinfo_data = sysinfo::parse_sysinfo(mount_point);
    let has_rockbox = root.join(".rockbox").is_dir();
    let rockbox = models::read_rockbox_info(mount_point);

    // Model name: SysInfo model number -> Rockbox target -> None
    let model_name = sysinfo_data
        .model_number
        .as_deref()
        .and_then(models::model_number_to_name)
        .map(String::from)
        .or_else(|| {
            rockbox
                .target
                .as_deref()
                .and_then(models::rockbox_target_to_name)
                .map(String::from)
        });

    let audio_space = audio_space::calculate_audio_space(mount_point);
    let used = disk_info.used_space.unwrap_or(0);
    let other_space = used.saturating_sub(audio_space);

    let rockbox_track_count = audio_space::quick_rockbox_track_count(mount_point);

    Ok(IpodInfo {
        volume_name: disk_info.name.clone(),
        identifier: disk_info.identifier.clone(),
        mount_point: mount_point.to_string(),
        total_space: disk_info.total_space.unwrap_or(0),
        used_space: used,
        free_space: disk_info.free_space.unwrap_or(0),
        format: "FAT32".to_string(),

        serial_number: sysinfo_data.serial_number,
        model_number: sysinfo_data.model_number,
        model_name,
        firmware_version: sysinfo_data.firmware_version,

        rockbox_version: rockbox.version,
        has_rockbox,

        audio_space,
        other_space,

        rockbox_track_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_read_ipod_info_with_rockbox_fallback() {
        let dir = tempfile::tempdir().unwrap();
        let mount = dir.path().to_str().unwrap();

        let device_dir = dir.path().join("iPod_Control").join("Device");
        fs::create_dir_all(&device_dir).unwrap();
        fs::write(device_dir.join("SysInfo"), "").unwrap();

        let rb_dir = dir.path().join(".rockbox");
        fs::create_dir_all(&rb_dir).unwrap();
        fs::write(
            rb_dir.join("rockbox-info.txt"),
            "Target: ipod6g\nVersion: 4.0\n",
        )
        .unwrap();

        let disk_info = DiskInfo {
            identifier: "disk5s2".to_string(),
            size: "119.1 GB".to_string(),
            name: "IPOD".to_string(),
            mounted: true,
            mount_point: Some(mount.to_string()),
            free_space: Some(60_000_000_000),
            used_space: Some(59_000_000_000),
            total_space: Some(119_000_000_000),
            media_name: Some("iPod Classic".to_string()),
        };

        let info = read_ipod_info(mount, &disk_info).unwrap();
        assert_eq!(info.model_name.as_deref(), Some("iPod Classic"));
        assert_eq!(info.rockbox_version.as_deref(), Some("4.0"));
        assert!(info.has_rockbox);
        assert_eq!(info.volume_name, "IPOD");
    }
}
