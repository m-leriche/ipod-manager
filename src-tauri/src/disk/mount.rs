use std::process::Command;

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
