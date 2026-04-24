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
    /// Device media name from diskutil (e.g., "iPod Classic", "iPod Nano").
    /// Only present when macOS recognizes the USB device as an iPod.
    pub media_name: Option<String>,
}

/// Run `diskutil list` and find an iPod among external FAT32 partitions.
///
/// Collects ALL external FAT32 partitions, then picks the best candidate:
/// 1. Mounted partitions with `iPod_Control/` or `.rockbox/` → confirmed iPod
/// 2. Remaining FAT32 partitions → unverified candidates (fallback)
///
/// This handles arbitrary disk numbers (disk5, disk6, etc.) and volume names.
pub fn detect_ipod_disk() -> Result<Option<DiskInfo>, String> {
    let candidates = find_all_fat32_partitions()?;
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
    Ok(Some(candidates.into_iter().next().unwrap()))
}

/// Check if a mounted filesystem looks like an iPod (has iPod_Control/ or .rockbox/).
fn is_ipod_filesystem(mount_point: &str) -> bool {
    let root = Path::new(mount_point);

    // Check for .rockbox directory
    if root.join(".rockbox").is_dir() {
        return true;
    }

    // Case-insensitive check for iPod_Control
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

/// Collect all external FAT32 partitions from diskutil.
fn find_all_fat32_partitions() -> Result<Vec<DiskInfo>, String> {
    let mut results = Vec::new();

    // Get plist output for structured parsing
    let output = Command::new("diskutil")
        .args(["list", "-plist", "external", "physical"])
        .output()
        .map_err(|e| format!("Failed to run diskutil: {}", e))?;

    if !output.status.success() {
        return Ok(results);
    }

    let plist_stdout = String::from_utf8_lossy(&output.stdout);

    // Get human-readable output for size/name parsing
    let human_output = Command::new("diskutil")
        .args(["list", "external", "physical"])
        .output()
        .map_err(|e| format!("Failed to run diskutil: {}", e))?;

    let human_stdout = String::from_utf8_lossy(&human_output.stdout);

    // Track identifiers we've already added to avoid duplicates
    let mut seen = std::collections::HashSet::new();

    // Parse human-readable output for FAT32 lines
    for line in human_stdout.lines() {
        let line_trimmed = line.trim();
        if line_trimmed.contains("DOS_FAT_32") || line_trimmed.contains("Windows_FAT_32") {
            if let Some(info) = parse_fat_partition_line(line_trimmed) {
                seen.insert(info.identifier.clone());
                results.push(info);
            }
        }
    }

    // Also check plist entries for partitions not caught by human output
    if plist_stdout.contains("<string>disk") {
        for line in plist_stdout.lines() {
            let line_trimmed = line.trim();
            if line_trimmed.starts_with("<string>disk") && line_trimmed.ends_with("</string>") {
                let ident = line_trimmed
                    .strip_prefix("<string>")
                    .and_then(|s| s.strip_suffix("</string>"))
                    .unwrap_or("");
                if ident.contains('s') && !ident.ends_with("s0") && !seen.contains(ident) {
                    if let Some(info) = check_partition_info(ident) {
                        seen.insert(info.identifier.clone());
                        results.push(info);
                    }
                }
            }
        }
    }

    Ok(results)
}

/// Get the parent disk's media name via `diskutil info`.
/// e.g., for "disk5s2" checks "disk5" — returns names like "iPod Classic", "iPod Nano".
fn get_parent_media_name(identifier: &str) -> Option<String> {
    // Strip partition suffix (e.g., "disk5s2" → "disk5")
    let parent = identifier.split('s').next()?;

    let output = Command::new("diskutil")
        .args(["info", parent])
        .output()
        .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    for line in stdout.lines() {
        let line = line.trim();
        if line.starts_with("Device / Media Name:") {
            let name = line.split(':').nth(1)?.trim();
            if !name.is_empty() {
                return Some(name.to_string());
            }
        }
    }

    None
}

/// Extract identifier, size, and name from a diskutil FAT partition line.
/// Pure parsing — no I/O. Returns (identifier, size, name).
fn parse_partition_fields(line: &str) -> Option<(String, String, String)> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    // Find the disk identifier (last part, starts with "disk")
    let identifier = parts
        .iter()
        .rev()
        .find(|p| p.starts_with("disk"))?
        .to_string();

    // Find the size (number followed by GB/TB/MB)
    let mut size = String::new();
    for (i, part) in parts.iter().enumerate() {
        if let Some(next) = parts.get(i + 1) {
            if (*next == "GB" || *next == "TB" || *next == "MB") && part.parse::<f64>().is_ok() {
                size = format!("{} {}", part, next);
                break;
            }
        }
    }

    // The name is typically between the filesystem type and the size
    let fs_type_idx = parts
        .iter()
        .position(|p| *p == "DOS_FAT_32" || *p == "Windows_FAT_32")?;
    let size_idx = parts
        .iter()
        .position(|p| p.parse::<f64>().is_ok())
        .unwrap_or(parts.len());
    let name = if size_idx > fs_type_idx + 1 {
        parts[fs_type_idx + 1..size_idx].join(" ")
    } else {
        String::new()
    };

    Some((identifier, size, name))
}

/// Parse a line like: "2: DOS_FAT_32 IPOD 119.1 GB disk5s1"
fn parse_fat_partition_line(line: &str) -> Option<DiskInfo> {
    let (identifier, size, name) = parse_partition_fields(line)?;

    let media_name = get_parent_media_name(&identifier);
    let mount_point = get_mount_point(&identifier);
    let mounted = mount_point.is_some();
    let (total_space, used_space, free_space) = mount_point
        .as_deref()
        .map(get_space_info)
        .unwrap_or((None, None, None));

    Some(DiskInfo {
        identifier,
        size,
        name,
        mounted,
        mount_point,
        free_space,
        used_space,
        total_space,
        media_name,
    })
}

/// Use `diskutil info` to check if a partition is FAT32
fn check_partition_info(identifier: &str) -> Option<DiskInfo> {
    let output = Command::new("diskutil")
        .args(["info", identifier])
        .output()
        .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Check if it's a FAT filesystem
    let is_fat = stdout.lines().any(|line| {
        let line = line.trim();
        (line.starts_with("File System Personality:") || line.starts_with("Type (Bundle):"))
            && (line.contains("FAT32") || line.contains("MS-DOS"))
    });

    if !is_fat {
        return None;
    }

    let mut name = String::new();
    let mut size = String::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.starts_with("Volume Name:") {
            name = line.split(':').nth(1).unwrap_or("").trim().to_string();
        }
        if line.starts_with("Disk Size:") {
            // "Disk Size: 119.1 GB (127865454592 Bytes)..."
            let after_colon = line.split(':').nth(1).unwrap_or("").trim();
            if let Some(paren_idx) = after_colon.find('(') {
                size = after_colon[..paren_idx].trim().to_string();
            } else {
                size = after_colon.to_string();
            }
        }
    }

    let media_name = get_parent_media_name(identifier);
    let mount_point = get_mount_point(identifier);
    let mounted = mount_point.is_some();
    let (total_space, used_space, free_space) = mount_point
        .as_deref()
        .map(get_space_info)
        .unwrap_or((None, None, None));

    Some(DiskInfo {
        identifier: identifier.to_string(),
        size,
        name,
        mounted,
        mount_point,
        free_space,
        used_space,
        total_space,
        media_name,
    })
}

/// Get disk space info (total, used, free) in bytes from `df`.
fn get_space_info(mount_point: &str) -> (Option<u64>, Option<u64>, Option<u64>) {
    let Ok(output) = Command::new("df").arg("-k").arg(mount_point).output() else {
        return (None, None, None);
    };
    let stdout = String::from_utf8_lossy(&output.stdout);
    let Some(line) = stdout.lines().nth(1) else {
        return (None, None, None);
    };
    let cols: Vec<&str> = line.split_whitespace().collect();
    // df -k columns: Filesystem 1024-blocks Used Available Capacity ...
    let total = cols
        .get(1)
        .and_then(|s| s.parse::<u64>().ok())
        .map(|kb| kb * 1024);
    let used = cols
        .get(2)
        .and_then(|s| s.parse::<u64>().ok())
        .map(|kb| kb * 1024);
    let free = cols
        .get(3)
        .and_then(|s| s.parse::<u64>().ok())
        .map(|kb| kb * 1024);
    (total, used, free)
}

/// Check if a disk identifier is currently mounted by parsing `mount` output
fn get_mount_point(identifier: &str) -> Option<String> {
    // Check /Volumes/IPOD specifically first
    if Path::new("/Volumes/IPOD").exists() {
        let output = Command::new("mount").output().ok()?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if line.contains(identifier) && line.contains("/Volumes/IPOD") {
                return Some("/Volumes/IPOD".to_string());
            }
        }
    }

    // Check `diskutil info` for mount point
    let output = Command::new("diskutil")
        .args(["info", identifier])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        let line = line.trim();
        if line.starts_with("Mount Point:") {
            let mp = line.split(':').nth(1).unwrap_or("").trim();
            if !mp.is_empty() {
                return Some(mp.to_string());
            }
        }
    }

    None
}

/// Mount the iPod at /Volumes/IPOD using sudo -S (password via stdin).
/// This matches the exact terminal workflow: sudo diskutil unmount, sudo mkdir, sudo mount -t msdos.
pub fn mount_ipod_disk(identifier: &str, password: &str) -> Result<(), String> {
    // Helper to run a command with sudo, piping password via stdin
    fn sudo_run(password: &str, args: &[&str]) -> Result<String, String> {
        use std::io::Write;
        use std::process::Stdio;

        let mut child = Command::new("sudo")
            .arg("-S") // read password from stdin
            .args(args)
            .current_dir("/")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn sudo: {}", e))?;

        // Write password to stdin
        if let Some(mut stdin) = child.stdin.take() {
            let _ = writeln!(stdin, "{}", password);
        }

        let output = child
            .wait_with_output()
            .map_err(|e| format!("Failed to wait for sudo: {}", e))?;

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

    // Step 1: Unmount from any existing mount point
    let _ = sudo_run(
        password,
        &["diskutil", "unmount", &format!("/dev/{}", identifier)],
    );

    // Step 2: Create mount point
    sudo_run(password, &["mkdir", "-p", "/Volumes/IPOD"])
        .map_err(|e| format!("Failed to create mount point: {}", e))?;

    // Step 3: Mount using mount -t msdos (exactly like your terminal command)
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
    .map_err(|e| format!("Mount failed: {}", e))?;

    Ok(())
}

/// Unmount the iPod from /Volumes/IPOD
pub fn unmount_ipod_disk() -> Result<(), String> {
    let output = Command::new("diskutil")
        .args(["unmount", "/Volumes/IPOD"])
        .output()
        .map_err(|e| format!("Failed to run diskutil: {}", e))?;

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

    #[test]
    fn parse_standard_fat32_line() {
        let line = "2: DOS_FAT_32 IPOD 119.1 GB disk5s2";
        let (id, size, name) = parse_partition_fields(line).unwrap();
        assert_eq!(id, "disk5s2");
        assert_eq!(size, "119.1 GB");
        assert_eq!(name, "IPOD");
    }

    #[test]
    fn parse_windows_fat32_line() {
        let line = "2: Windows_FAT_32 IPOD 119.1 GB disk5s1";
        let (id, size, name) = parse_partition_fields(line).unwrap();
        assert_eq!(id, "disk5s1");
        assert_eq!(size, "119.1 GB");
        assert_eq!(name, "IPOD");
    }

    #[test]
    fn parse_multi_word_name() {
        let line = "2: DOS_FAT_32 MY IPOD 64.0 GB disk3s1";
        let (id, size, name) = parse_partition_fields(line).unwrap();
        assert_eq!(id, "disk3s1");
        assert_eq!(size, "64.0 GB");
        assert_eq!(name, "MY IPOD");
    }

    #[test]
    fn parse_mb_size() {
        let line = "2: DOS_FAT_32 SHUFFLE 512.0 MB disk2s1";
        let (id, size, name) = parse_partition_fields(line).unwrap();
        assert_eq!(id, "disk2s1");
        assert_eq!(size, "512.0 MB");
        assert_eq!(name, "SHUFFLE");
    }

    #[test]
    fn parse_no_fat_type_returns_none() {
        let line = "2: Apple_APFS Container 119.1 GB disk1s2";
        assert!(parse_partition_fields(line).is_none());
    }
}
