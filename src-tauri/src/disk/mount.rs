use std::process::Command;

/// Default mount point used when no volume name is available.
pub const DEFAULT_MOUNT_POINT: &str = "/Volumes/IPOD";

/// Mount the iPod using `sudo mount -t msdos`.
/// `mount_point` controls where the volume appears (e.g. `/Volumes/IPOD`).
/// Password is piped to sudo via stdin.
pub fn mount_ipod_disk(identifier: &str, password: &str, mount_point: &str) -> Result<(), String> {
    log::info!(
        "Mounting iPod: identifier={}, mount_point={}",
        identifier,
        mount_point
    );
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
            writeln!(stdin, "{}", password)
                .map_err(|e| format!("Failed to write password to sudo stdin: {e}"))?;
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
    log::info!("Step 1: unmounting existing mount (best-effort)");
    let _ = sudo_run(
        password,
        &["diskutil", "unmount", &format!("/dev/{}", identifier)],
    );

    // Step 2: Create mount point
    log::info!("Step 2: creating mount point {}", mount_point);
    sudo_run(password, &["mkdir", "-p", mount_point])
        .map_err(|e| format!("Failed to create mount point: {e}"))?;

    // Step 3: Mount as FAT32
    log::info!("Step 3: mounting /dev/{} as FAT32", identifier);
    sudo_run(
        password,
        &[
            "mount",
            "-t",
            "msdos",
            &format!("/dev/{}", identifier),
            mount_point,
        ],
    )
    .map_err(|e| format!("Mount failed: {e}"))?;

    log::info!("iPod mounted successfully at {}", mount_point);
    Ok(())
}

/// Unmount the iPod at the given mount point.
pub fn unmount_ipod_disk(mount_point: &str) -> Result<(), String> {
    log::info!("Unmounting iPod at {}", mount_point);
    let output = Command::new("diskutil")
        .args(["unmount", mount_point])
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
