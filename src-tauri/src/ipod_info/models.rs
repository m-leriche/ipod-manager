use std::fs;
use std::path::Path;

#[derive(Debug, Default)]
pub struct RockboxInfo {
    pub version: Option<String>,
    pub target: Option<String>,
}

pub fn model_number_to_name(model_num: &str) -> Option<&'static str> {
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

/// Map Rockbox target identifiers to human-readable iPod model names.
pub fn rockbox_target_to_name(target: &str) -> Option<&'static str> {
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

pub fn read_rockbox_info(mount_point: &str) -> RockboxInfo {
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
}
