use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
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

// ── Helper binary resolution ──────────────────────────────────────

/// Locate the `crate-disk-helper` Swift binary.
/// In production builds it sits next to the main executable (Tauri bundles it).
/// In development it lives at `src-tauri/binaries/` (compiled by build.rs).
fn helper_path() -> Result<PathBuf, String> {
    let triple = target_triple();

    // Production (and dev after Tauri copies the sidecar): next to the running executable
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let path = dir.join(format!("crate-disk-helper-{triple}"));
            if path.exists() {
                return Ok(path);
            }
        }
    }

    // Development fallback: in binaries/ relative to the crate manifest.
    // Only compiled into debug builds to avoid leaking the build path into release binaries.
    #[cfg(debug_assertions)]
    {
        let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(format!("crate-disk-helper-{triple}"));
        if dev_path.exists() {
            return Ok(dev_path);
        }
    }

    #[cfg(debug_assertions)]
    let msg = "crate-disk-helper not found — run `swift build -c release` in swift-helper/";
    #[cfg(not(debug_assertions))]
    let msg = "Disk helper not found — the app may be corrupted. Try reinstalling.";

    Err(msg.into())
}

fn target_triple() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        "aarch64-apple-darwin"
    } else {
        "x86_64-apple-darwin"
    }
}

fn run_helper(args: &[&str]) -> Result<std::process::Output, String> {
    let path = helper_path()?;
    Command::new(&path)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to run crate-disk-helper: {e}"))
}

// ── Public API ────────────────────────────────────────────────────

/// Detect an iPod among external FAT32 partitions.
///
/// Calls the Swift helper to enumerate disks via DiskArbitration, then picks
/// the best iPod candidate using the same priority as before:
/// 1. USB device recognized as iPod by macOS (media_name contains "ipod")
/// 2. Mounted partition with `iPod_Control/` or `.rockbox/`
/// 3. First FAT32 partition (fallback)
pub fn detect_ipod_disk() -> Result<Option<DiskInfo>, String> {
    let output = run_helper(&["detect"])?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Detection failed: {}", stderr.trim()));
    }

    let candidates: Vec<DiskInfo> = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Invalid helper output: {e}"))?;

    Ok(pick_ipod(candidates))
}

/// Mount the iPod using DiskArbitration (no sudo required).
/// macOS chooses the mount point (typically /Volumes/<VolumeName>).
pub fn mount_ipod_disk(identifier: &str) -> Result<(), String> {
    let output = run_helper(&["mount", identifier])?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(stderr.trim().to_string());
    }

    Ok(())
}

/// Unmount the iPod from /Volumes/IPOD.
/// The Swift helper accepts an optional volume path for flexibility (e.g., "/Volumes/IPOD 1"),
/// but we default to /Volumes/IPOD since that's where mount always targets.
pub fn unmount_ipod_disk() -> Result<(), String> {
    let output = run_helper(&["unmount"])?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(stderr.trim().to_string());
    }

    Ok(())
}

// ── iPod detection heuristics ─────────────────────────────────────

fn pick_ipod(candidates: Vec<DiskInfo>) -> Option<DiskInfo> {
    if candidates.is_empty() {
        return None;
    }

    // Priority 1: USB device recognized as iPod by macOS (works before mounting)
    for info in &candidates {
        if info
            .media_name
            .as_deref()
            .is_some_and(|n| n.to_ascii_lowercase().contains("ipod"))
        {
            return Some(info.clone());
        }
    }

    // Priority 2: Mounted partition with iPod_Control/ or .rockbox/
    for info in &candidates {
        if let Some(ref mp) = info.mount_point {
            if is_ipod_filesystem(mp) {
                return Some(info.clone());
            }
        }
    }

    // Priority 3: Fall back to first FAT32 partition
    candidates.into_iter().next()
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

#[cfg(test)]
mod tests {
    use super::*;

    // ── iPod picking logic ──────────────────────────────────────────

    fn make_disk(name: &str, media_name: Option<&str>, mount_point: Option<&str>) -> DiskInfo {
        DiskInfo {
            identifier: "disk5s1".to_string(),
            size: "119.1 GB".to_string(),
            name: name.to_string(),
            mounted: mount_point.is_some(),
            mount_point: mount_point.map(String::from),
            free_space: None,
            used_space: None,
            total_space: None,
            media_name: media_name.map(String::from),
        }
    }

    #[test]
    fn pick_ipod_empty_returns_none() {
        assert!(pick_ipod(vec![]).is_none());
    }

    #[test]
    fn pick_ipod_prefers_media_name() {
        let ipod = make_disk("IPOD", Some("iPod Classic"), None);
        let other = make_disk("USB", None, None);
        let result = pick_ipod(vec![other, ipod]).unwrap();
        assert_eq!(result.media_name.as_deref(), Some("iPod Classic"));
    }

    #[test]
    fn pick_ipod_fallback_to_first() {
        let disk = make_disk("USB", None, None);
        let result = pick_ipod(vec![disk]).unwrap();
        assert_eq!(result.name, "USB");
    }

    #[test]
    fn pick_ipod_media_name_case_insensitive() {
        let disk = make_disk("X", Some("IPOD Nano"), None);
        let result = pick_ipod(vec![disk]).unwrap();
        assert_eq!(result.media_name.as_deref(), Some("IPOD Nano"));
    }

    // ── JSON deserialization ────────────────────────────────────────

    #[test]
    fn deserialize_disk_info() {
        let json = r#"{
            "identifier": "disk5s1",
            "size": "119.1 GB",
            "name": "IPOD",
            "mounted": true,
            "mount_point": "/Volumes/IPOD",
            "free_space": 50000000000,
            "used_space": 69100000000,
            "total_space": 119100000000,
            "media_name": "iPod Classic"
        }"#;
        let info: DiskInfo = serde_json::from_str(json).unwrap();
        assert_eq!(info.identifier, "disk5s1");
        assert_eq!(info.mount_point.as_deref(), Some("/Volumes/IPOD"));
        assert_eq!(info.media_name.as_deref(), Some("iPod Classic"));
        assert_eq!(info.free_space, Some(50_000_000_000));
    }

    #[test]
    fn deserialize_disk_info_nulls() {
        let json = r#"{
            "identifier": "disk3s1",
            "size": "64.0 GB",
            "name": "DRIVE",
            "mounted": false,
            "mount_point": null,
            "free_space": null,
            "used_space": null,
            "total_space": null,
            "media_name": null
        }"#;
        let info: DiskInfo = serde_json::from_str(json).unwrap();
        assert!(!info.mounted);
        assert!(info.mount_point.is_none());
        assert!(info.free_space.is_none());
    }

    #[test]
    fn deserialize_array_of_disks() {
        let json = r#"[
            {"identifier":"disk5s1","size":"119.1 GB","name":"IPOD","mounted":false,"mount_point":null,"free_space":null,"used_space":null,"total_space":null,"media_name":"iPod Classic"},
            {"identifier":"disk6s1","size":"32.0 GB","name":"USB","mounted":true,"mount_point":"/Volumes/USB","free_space":10000,"used_space":22000,"total_space":32000,"media_name":null}
        ]"#;
        let disks: Vec<DiskInfo> = serde_json::from_str(json).unwrap();
        assert_eq!(disks.len(), 2);
        assert_eq!(disks[0].identifier, "disk5s1");
        assert_eq!(disks[1].identifier, "disk6s1");
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

    // ── Filesystem detection ────────────────────────────────────────

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
