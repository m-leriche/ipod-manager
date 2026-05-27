//! Shared utilities for spawning and managing external processes (yt-dlp, ffmpeg, etc.).
//!
//! Provides:
//! - `kill_and_wait`: kill a child process and wait for it to exit (prevents zombies).
//! - `drain_stderr`: background thread that reads stderr to prevent pipe deadlocks.
//! - `wait_with_timeout`: wait for a process to exit with a deadline.

use std::process::Child;
use std::time::{Duration, Instant};

/// Kill a child process and wait for it to exit (reap the zombie).
/// On Unix, `Child::kill()` sends SIGKILL which cannot be ignored.
pub fn kill_and_wait(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

/// Drain stderr from a child process in a background thread to prevent pipe buffer deadlocks.
/// Returns a handle that can be joined to get the stderr contents.
pub fn drain_stderr(child: &mut Child) -> Option<std::thread::JoinHandle<String>> {
    child.stderr.take().map(|mut stderr| {
        std::thread::spawn(move || {
            let mut buf = String::new();
            if let Err(e) = std::io::Read::read_to_string(&mut stderr, &mut buf) {
                log::warn!("Failed to read process stderr: {}", e);
            }
            buf
        })
    })
}

/// Collect stderr from a drain handle, returning empty string on failure.
pub fn collect_stderr(handle: Option<std::thread::JoinHandle<String>>) -> String {
    handle
        .and_then(|h| match h.join() {
            Ok(s) => Some(s),
            Err(_) => {
                log::warn!("stderr drain thread panicked");
                None
            }
        })
        .unwrap_or_default()
}

/// Wait for a child process to exit, with a timeout. If the process doesn't
/// exit within `timeout`, it is killed.
pub fn wait_with_timeout(
    child: &mut Child,
    timeout: Duration,
) -> Result<std::process::ExitStatus, String> {
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Ok(status),
            Ok(None) => {
                if Instant::now() >= deadline {
                    log::warn!(
                        "Process {} timed out after {:?}, killing",
                        child.id(),
                        timeout
                    );
                    kill_and_wait(child);
                    return Err(format!(
                        "Process timed out after {} seconds",
                        timeout.as_secs()
                    ));
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => return Err(format!("Failed to wait for process: {}", e)),
        }
    }
}

/// Clean up a list of file paths (best-effort, logs warnings on failure).
pub fn cleanup_files(paths: &[String]) {
    for path in paths {
        if std::path::Path::new(path).exists() {
            if let Err(e) = std::fs::remove_file(path) {
                log::warn!("Failed to clean up temp file {}: {}", path, e);
            }
        }
    }
}

/// Clean up a directory if it exists (best-effort, logs warnings on failure).
pub fn cleanup_dir(path: &str) {
    let p = std::path::Path::new(path);
    if p.is_dir() {
        if let Err(e) = std::fs::remove_dir_all(p) {
            log::warn!("Failed to clean up temp directory {}: {}", path, e);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    #[test]
    fn kill_and_wait_exits_cleanly() {
        let mut child = Command::new("sleep")
            .arg("60")
            .spawn()
            .expect("failed to spawn sleep");

        kill_and_wait(&mut child);

        // Process should be reaped
        let status = child.try_wait().expect("try_wait failed");
        assert!(status.is_some(), "process should have exited");
    }

    #[test]
    fn wait_with_timeout_succeeds_for_fast_process() {
        let mut child = Command::new("true").spawn().expect("failed to spawn true");

        let result = wait_with_timeout(&mut child, Duration::from_secs(5));
        assert!(result.is_ok());
        assert!(result.unwrap().success());
    }

    #[test]
    fn wait_with_timeout_kills_slow_process() {
        let mut child = Command::new("sleep")
            .arg("60")
            .spawn()
            .expect("failed to spawn sleep");

        let result = wait_with_timeout(&mut child, Duration::from_secs(1));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("timed out"));
    }

    #[test]
    fn drain_stderr_captures_output() {
        let mut child = Command::new("sh")
            .args(["-c", "echo hello_stderr >&2"])
            .stderr(std::process::Stdio::piped())
            .spawn()
            .expect("failed to spawn sh");

        let handle = drain_stderr(&mut child);
        let _ = child.wait();
        let stderr = collect_stderr(handle);
        assert!(stderr.contains("hello_stderr"));
    }

    #[test]
    fn collect_stderr_returns_empty_on_none() {
        assert_eq!(collect_stderr(None), "");
    }

    #[test]
    fn cleanup_files_ignores_nonexistent() {
        cleanup_files(&["/nonexistent/path/12345.tmp".to_string()]);
        // Should not panic
    }
}
