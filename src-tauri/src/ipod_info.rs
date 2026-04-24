use crate::disk::DiskInfo;
use serde::Serialize;
use std::fs;
use std::path::Path;

const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "flac", "m4a", "ogg", "opus", "wav", "aiff", "aif", "wma", "ape", "mpc",
];

const ROCKBOX_MAGIC_V10: i32 = 0x5443_4810;
const ROCKBOX_MAGIC_V0F: i32 = 0x5443_480F;

// ── Public Types ────────────────────────────────────────────────

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

#[derive(Debug, Default)]
struct SysInfoData {
    serial_number: Option<String>,
    model_number: Option<String>,
    firmware_version: Option<String>,
}

// ── Main Entry Point ────────────────────────────────────────────

pub fn read_ipod_info(mount_point: &str, disk_info: &DiskInfo) -> Result<IpodInfo, String> {
    let root = Path::new(mount_point);
    if !root.is_dir() {
        return Err(format!("Mount point does not exist: {}", mount_point));
    }

    let sysinfo = parse_sysinfo(mount_point);
    let has_rockbox = root.join(".rockbox").is_dir();
    let rockbox = read_rockbox_info(mount_point);

    // Model name: SysInfo model number → Rockbox target → media_name → None
    let model_name = sysinfo
        .model_number
        .as_deref()
        .and_then(model_number_to_name)
        .map(String::from)
        .or_else(|| {
            rockbox
                .target
                .as_deref()
                .and_then(rockbox_target_to_name)
                .map(String::from)
        });

    let audio_space = calculate_audio_space(mount_point);
    let used = disk_info.used_space.unwrap_or(0);
    let other_space = used.saturating_sub(audio_space);

    let rockbox_track_count = quick_rockbox_track_count(mount_point);

    Ok(IpodInfo {
        volume_name: disk_info.name.clone(),
        identifier: disk_info.identifier.clone(),
        mount_point: mount_point.to_string(),
        total_space: disk_info.total_space.unwrap_or(0),
        used_space: used,
        free_space: disk_info.free_space.unwrap_or(0),
        format: "FAT32".to_string(),

        serial_number: sysinfo.serial_number,
        model_number: sysinfo.model_number,
        model_name,
        firmware_version: sysinfo.firmware_version,

        rockbox_version: rockbox.version,
        has_rockbox,

        audio_space,
        other_space,

        rockbox_track_count,
    })
}

// ── SysInfo Parsing ─────────────────────────────────────────────

/// Find the iPod_Control directory with case-insensitive lookup.
fn find_ipod_control(mount_point: &str) -> Option<std::path::PathBuf> {
    let root = Path::new(mount_point);
    let entries = fs::read_dir(root).ok()?;

    for entry in entries.flatten() {
        let name = entry.file_name();
        if name.to_string_lossy().eq_ignore_ascii_case("iPod_Control") && entry.path().is_dir() {
            return Some(entry.path());
        }
    }
    None
}

fn parse_sysinfo(mount_point: &str) -> SysInfoData {
    let ipod_control = match find_ipod_control(mount_point) {
        Some(p) => p,
        None => return SysInfoData::default(),
    };

    let device_dir = ipod_control.join("Device");
    let device_dir = if device_dir.is_dir() {
        device_dir
    } else {
        let alt = ipod_control.join("device");
        if alt.is_dir() {
            alt
        } else {
            return SysInfoData::default();
        }
    };

    // Try SysInfo (key=value text file) first
    let mut data = parse_sysinfo_text(&device_dir.join("SysInfo"));

    // Fall back to SysInfoExtended (XML plist) for any missing fields
    if data.serial_number.is_none()
        || data.model_number.is_none()
        || data.firmware_version.is_none()
    {
        let extended = parse_sysinfo_extended(&device_dir.join("SysInfoExtended"));
        if data.serial_number.is_none() {
            data.serial_number = extended.serial_number;
        }
        if data.model_number.is_none() {
            data.model_number = extended.model_number;
        }
        if data.firmware_version.is_none() {
            data.firmware_version = extended.firmware_version;
        }
    }

    data
}

/// Parse the plain-text SysInfo file (key: value or key=value format).
fn parse_sysinfo_text(path: &Path) -> SysInfoData {
    let content = match fs::read_to_string(path) {
        Ok(c) if !c.trim().is_empty() => c,
        _ => return SysInfoData::default(),
    };

    let mut data = SysInfoData::default();

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let (key, value) = if let Some(pos) = line.find(':') {
            (line[..pos].trim(), line[pos + 1..].trim())
        } else if let Some(pos) = line.find('=') {
            (line[..pos].trim(), line[pos + 1..].trim())
        } else {
            continue;
        };

        match key {
            "pszSerialNumber" => data.serial_number = Some(value.to_string()),
            "ModelNumStr" => data.model_number = Some(value.to_string()),
            "visibleBuildID" => data.firmware_version = Some(value.to_string()),
            _ => {}
        }
    }

    data
}

/// Parse the XML plist SysInfoExtended file for serial, model, and firmware.
fn parse_sysinfo_extended(path: &Path) -> SysInfoData {
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return SysInfoData::default(),
    };

    let mut data = SysInfoData::default();
    let lines: Vec<&str> = content.lines().collect();

    // Simple plist parser: look for <key>X</key> followed by <string>Y</string>
    for (i, line) in lines.iter().enumerate() {
        let line = line.trim();
        if let Some(key) = extract_plist_key(line) {
            if let Some(value) = lines
                .get(i + 1)
                .and_then(|l| extract_plist_string(l.trim()))
            {
                match key {
                    "SerialNumber" => data.serial_number = Some(value),
                    "ModelNumStr" => data.model_number = Some(value),
                    "VisibleBuildID" => data.firmware_version = Some(value),
                    _ => {}
                }
            }
        }
    }

    data
}

fn extract_plist_key(line: &str) -> Option<&str> {
    line.strip_prefix("<key>")
        .and_then(|s| s.strip_suffix("</key>"))
}

fn extract_plist_string(line: &str) -> Option<String> {
    line.strip_prefix("<string>")
        .and_then(|s| s.strip_suffix("</string>"))
        .map(|s| s.to_string())
}

// ── Model Number Lookup ─────────────────────────────────────────

fn model_number_to_name(model_num: &str) -> Option<&'static str> {
    match model_num {
        // iPod Classic / Video
        "MA002" => Some("iPod 5th Gen (30GB)"),
        "MA003" => Some("iPod 5th Gen (60GB)"),
        "MA099" => Some("iPod 5th Gen (30GB)"),
        "MA146" => Some("iPod 5th Gen (60GB)"),
        "MA444" => Some("iPod 5th Gen (30GB)"),
        "MA446" => Some("iPod 5.5th Gen (30GB)"),
        "MA448" => Some("iPod 5.5th Gen (80GB)"),
        "MB029" => Some("iPod Classic 6th Gen (80GB)"),
        "MB147" => Some("iPod Classic 6th Gen (160GB)"),
        "MB145" => Some("iPod Classic 6th Gen (80GB) Silver"),
        "MB150" => Some("iPod Classic 6th Gen (160GB) Silver"),
        "MC293" => Some("iPod Classic 7th Gen (160GB) Black"),
        "MC297" => Some("iPod Classic 7th Gen (160GB) Silver"),
        "PC086" => Some("iPod Classic 7th Gen (160GB)"),
        "PC297" => Some("iPod Classic 7th Gen (160GB)"),
        // iPod Nano
        "MA004" | "MA005" | "MA107" | "MA350" | "MA352" | "MA497" | "MA099N" => {
            Some("iPod Nano 1st Gen")
        }
        "MA477" | "MA426" | "MA428" => Some("iPod Nano 2nd Gen"),
        // iPod Mini
        "M9160" | "M9436" | "M9437" | "M9800" | "M9801" | "M9802" | "M9803" | "M9804" | "M9805"
        | "M9806" | "M9807" => Some("iPod Mini"),
        _ => None,
    }
}

// ── Rockbox Info ────────────────────────────────────────────────

#[derive(Debug, Default)]
struct RockboxInfo {
    version: Option<String>,
    target: Option<String>,
}

fn read_rockbox_info(mount_point: &str) -> RockboxInfo {
    let info_path = Path::new(mount_point)
        .join(".rockbox")
        .join("rockbox-info.txt");

    let content = match fs::read_to_string(info_path) {
        Ok(c) => c,
        Err(_) => return RockboxInfo::default(),
    };

    let mut info = RockboxInfo::default();

    for line in content.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("Version:") {
            let v = rest.trim();
            if !v.is_empty() {
                info.version = Some(v.to_string());
            }
        } else if let Some(rest) = line.strip_prefix("Target:") {
            let t = rest.trim();
            if !t.is_empty() {
                info.target = Some(t.to_string());
            }
        }
    }

    info
}

/// Map Rockbox target identifiers to human-readable iPod model names.
fn rockbox_target_to_name(target: &str) -> Option<&'static str> {
    match target {
        "ipod6g" => Some("iPod Classic"),
        "ipodvideo" => Some("iPod Video (5th/5.5th Gen)"),
        "ipod1g2g" => Some("iPod 1st/2nd Gen"),
        "ipod3g" => Some("iPod 3rd Gen"),
        "ipod4g" | "ipod4gray" => Some("iPod 4th Gen"),
        "ipodcolor" => Some("iPod Photo/Color"),
        "ipodmini" | "ipodmini1g" => Some("iPod Mini 1st Gen"),
        "ipodmini2g" => Some("iPod Mini 2nd Gen"),
        "ipodnano" | "ipodnano1g" => Some("iPod Nano 1st Gen"),
        "ipodnano2g" => Some("iPod Nano 2nd Gen"),
        _ => None,
    }
}

// ── Audio Space Calculation ─────────────────────────────────────

fn calculate_audio_space(mount_point: &str) -> u64 {
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

// ── Quick Rockbox Track Count ───────────────────────────────────

fn quick_rockbox_track_count(mount_point: &str) -> Option<usize> {
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

// ── Tests ───────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_model_number_lookup_known() {
        assert_eq!(model_number_to_name("MA448"), Some("iPod 5.5th Gen (80GB)"));
        assert_eq!(
            model_number_to_name("MC293"),
            Some("iPod Classic 7th Gen (160GB) Black")
        );
        assert_eq!(
            model_number_to_name("MB029"),
            Some("iPod Classic 6th Gen (80GB)")
        );
    }

    #[test]
    fn test_model_number_lookup_unknown() {
        assert_eq!(model_number_to_name("ZZZZZ"), None);
        assert_eq!(model_number_to_name(""), None);
    }

    #[test]
    fn test_parse_sysinfo_missing_dir() {
        let data = parse_sysinfo("/nonexistent/path");
        assert!(data.serial_number.is_none());
        assert!(data.model_number.is_none());
        assert!(data.firmware_version.is_none());
    }

    #[test]
    fn test_rockbox_target_lookup() {
        assert_eq!(rockbox_target_to_name("ipod6g"), Some("iPod Classic"));
        assert_eq!(
            rockbox_target_to_name("ipodvideo"),
            Some("iPod Video (5th/5.5th Gen)")
        );
        assert_eq!(
            rockbox_target_to_name("ipodmini2g"),
            Some("iPod Mini 2nd Gen")
        );
        assert_eq!(rockbox_target_to_name("unknown"), None);
    }

    #[test]
    fn test_plist_key_extraction() {
        assert_eq!(
            extract_plist_key("<key>SerialNumber</key>"),
            Some("SerialNumber")
        );
        assert_eq!(extract_plist_key("<string>hello</string>"), None);
        assert_eq!(extract_plist_key("no tags"), None);
    }

    #[test]
    fn test_plist_string_extraction() {
        assert_eq!(
            extract_plist_string("<string>8K419C319ZU</string>"),
            Some("8K419C319ZU".to_string())
        );
        assert_eq!(extract_plist_string("<key>foo</key>"), None);
        assert_eq!(extract_plist_string("plain text"), None);
    }

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
    fn test_parse_sysinfo_text_colon_format() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("SysInfo");
        fs::write(
            &path,
            "pszSerialNumber: ABC123\nModelNumStr: MA448\nvisibleBuildID: 1.3.0\n",
        )
        .unwrap();
        let data = parse_sysinfo_text(&path);
        assert_eq!(data.serial_number.as_deref(), Some("ABC123"));
        assert_eq!(data.model_number.as_deref(), Some("MA448"));
        assert_eq!(data.firmware_version.as_deref(), Some("1.3.0"));
    }

    #[test]
    fn test_parse_sysinfo_text_equals_format() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("SysInfo");
        fs::write(&path, "pszSerialNumber=XYZ789\nModelNumStr=MB029\n").unwrap();
        let data = parse_sysinfo_text(&path);
        assert_eq!(data.serial_number.as_deref(), Some("XYZ789"));
        assert_eq!(data.model_number.as_deref(), Some("MB029"));
        assert!(data.firmware_version.is_none());
    }

    #[test]
    fn test_parse_sysinfo_text_empty_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("SysInfo");
        fs::write(&path, "").unwrap();
        let data = parse_sysinfo_text(&path);
        assert!(data.serial_number.is_none());
    }

    #[test]
    fn test_parse_sysinfo_text_comments_and_blanks() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("SysInfo");
        fs::write(
            &path,
            "# comment\n\npszSerialNumber: SER123\n# another comment\n",
        )
        .unwrap();
        let data = parse_sysinfo_text(&path);
        assert_eq!(data.serial_number.as_deref(), Some("SER123"));
    }

    #[test]
    fn test_parse_sysinfo_extended_valid_plist() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("SysInfoExtended");
        let plist = r#"<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
<key>SerialNumber</key>
<string>8K419C319ZU</string>
<key>VisibleBuildID</key>
<string>2.0.5</string>
</dict>
</plist>"#;
        fs::write(&path, plist).unwrap();
        let data = parse_sysinfo_extended(&path);
        assert_eq!(data.serial_number.as_deref(), Some("8K419C319ZU"));
        assert_eq!(data.firmware_version.as_deref(), Some("2.0.5"));
        assert!(data.model_number.is_none());
    }

    #[test]
    fn test_parse_sysinfo_extended_missing_file() {
        let data = parse_sysinfo_extended(Path::new("/nonexistent/SysInfoExtended"));
        assert!(data.serial_number.is_none());
        assert!(data.model_number.is_none());
        assert!(data.firmware_version.is_none());
    }

    #[test]
    fn test_parse_sysinfo_fallback_to_extended() {
        let dir = tempfile::tempdir().unwrap();
        let ipod_control = dir.path().join("iPod_Control");
        let device_dir = ipod_control.join("Device");
        fs::create_dir_all(&device_dir).unwrap();

        // Empty SysInfo
        fs::write(device_dir.join("SysInfo"), "").unwrap();

        // SysInfoExtended with data
        let plist = r#"<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
<key>SerialNumber</key>
<string>FROMEXTENDED</string>
<key>VisibleBuildID</key>
<string>2.0.5</string>
</dict>
</plist>"#;
        fs::write(device_dir.join("SysInfoExtended"), plist).unwrap();

        let data = parse_sysinfo(dir.path().to_str().unwrap());
        assert_eq!(data.serial_number.as_deref(), Some("FROMEXTENDED"));
        assert_eq!(data.firmware_version.as_deref(), Some("2.0.5"));
    }

    #[test]
    fn test_read_rockbox_info_valid() {
        let dir = tempfile::tempdir().unwrap();
        let rb_dir = dir.path().join(".rockbox");
        fs::create_dir_all(&rb_dir).unwrap();
        fs::write(
            rb_dir.join("rockbox-info.txt"),
            "Target: ipod6g\nVersion: 4.0\nMemory: 64\n",
        )
        .unwrap();
        let info = read_rockbox_info(dir.path().to_str().unwrap());
        assert_eq!(info.version.as_deref(), Some("4.0"));
        assert_eq!(info.target.as_deref(), Some("ipod6g"));
    }

    #[test]
    fn test_read_rockbox_info_missing() {
        let info = read_rockbox_info("/nonexistent/path");
        assert!(info.version.is_none());
        assert!(info.target.is_none());
    }

    #[test]
    fn test_find_ipod_control_case_insensitive() {
        let dir = tempfile::tempdir().unwrap();
        // Create with different casing
        fs::create_dir_all(dir.path().join("IPOD_CONTROL")).unwrap();
        let result = find_ipod_control(dir.path().to_str().unwrap());
        assert!(result.is_some());
        assert!(result.unwrap().is_dir());
    }

    #[test]
    fn test_find_ipod_control_missing() {
        let dir = tempfile::tempdir().unwrap();
        let result = find_ipod_control(dir.path().to_str().unwrap());
        assert!(result.is_none());
    }

    #[test]
    fn test_calculate_audio_space_with_files() {
        let dir = tempfile::tempdir().unwrap();
        let music_dir = dir.path().join("Music");
        fs::create_dir_all(&music_dir).unwrap();

        // Create audio files with known sizes
        fs::write(music_dir.join("song.mp3"), vec![0u8; 1000]).unwrap();
        fs::write(music_dir.join("track.flac"), vec![0u8; 2000]).unwrap();
        // Non-audio file should be ignored
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

    #[test]
    fn test_read_ipod_info_with_rockbox_fallback() {
        let dir = tempfile::tempdir().unwrap();
        let mount = dir.path().to_str().unwrap();

        // Create iPod_Control with empty SysInfo
        let device_dir = dir.path().join("iPod_Control").join("Device");
        fs::create_dir_all(&device_dir).unwrap();
        fs::write(device_dir.join("SysInfo"), "").unwrap();

        // Create .rockbox with target info
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
        // Model name falls back to Rockbox target
        assert_eq!(info.model_name.as_deref(), Some("iPod Classic"));
        assert_eq!(info.rockbox_version.as_deref(), Some("4.0"));
        assert!(info.has_rockbox);
        assert_eq!(info.volume_name, "IPOD");
    }
}
