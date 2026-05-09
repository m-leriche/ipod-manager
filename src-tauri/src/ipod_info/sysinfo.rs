use std::fs;
use std::path::Path;

#[derive(Debug, Default)]
pub struct SysInfoData {
    pub serial_number: Option<String>,
    pub model_number: Option<String>,
    pub firmware_version: Option<String>,
}

/// Find the iPod_Control directory with case-insensitive lookup.
pub fn find_ipod_control(mount_point: &str) -> Option<std::path::PathBuf> {
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

pub fn parse_sysinfo(mount_point: &str) -> SysInfoData {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_sysinfo_missing_dir() {
        let data = parse_sysinfo("/nonexistent/path");
        assert!(data.serial_number.is_none());
        assert!(data.model_number.is_none());
        assert!(data.firmware_version.is_none());
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

        fs::write(device_dir.join("SysInfo"), "").unwrap();

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
    fn test_find_ipod_control_case_insensitive() {
        let dir = tempfile::tempdir().unwrap();
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
}
