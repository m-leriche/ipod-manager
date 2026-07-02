//! FFprobe/FFmpeg fallback for reading and writing metadata on files that lofty
//! cannot parse (e.g. certain m4a containers with non-standard timescale).

use std::io::Read as _;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Duration;

/// Kill ffprobe if it hangs (e.g. a file on a stale network mount) — callers
/// treat a timeout the same as any other probe failure.
const FFPROBE_TIMEOUT: Duration = Duration::from_secs(15);

/// Metadata fields read via ffprobe.
pub struct FfprobeMetadata {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track: Option<u32>,
    pub track_total: Option<u32>,
    pub disc: Option<u32>,
    pub disc_total: Option<u32>,
    pub year: Option<u32>,
    pub genre: Option<String>,
    pub duration_secs: f64,
    pub sample_rate: Option<u32>,
    pub bitrate_kbps: Option<u32>,
    pub sort_artist: Option<String>,
    pub sort_album_artist: Option<String>,
    pub compilation: bool,
}

fn trim_tag(s: &str) -> Option<String> {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// Parse "3/14" or "3" into (Some(3), Some(14)) or (Some(3), None).
fn parse_slash_pair(s: &str) -> (Option<u32>, Option<u32>) {
    let parts: Vec<&str> = s.split('/').collect();
    let first = parts.first().and_then(|p| p.trim().parse::<u32>().ok());
    let second = parts.get(1).and_then(|p| p.trim().parse::<u32>().ok());
    (first, second)
}

/// Read metadata from a file using ffprobe. Returns None if ffprobe fails.
pub fn read_metadata(path: &Path) -> Option<FfprobeMetadata> {
    let mut child = Command::new("ffprobe")
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            // `--` ends option parsing so a path beginning with `-` is treated
            // as a filename, not an ffprobe flag.
            "--",
        ])
        .arg(path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;

    // Drain stdout on a thread so a large JSON payload can't fill the pipe
    // and deadlock against the timeout wait below.
    let mut stdout_pipe = child.stdout.take()?;
    let reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stdout_pipe.read_to_end(&mut buf);
        buf
    });

    let status = crate::process::wait_with_timeout(&mut child, FFPROBE_TIMEOUT).ok()?;
    let stdout = reader.join().ok()?;
    if !status.success() {
        return None;
    }

    let json: serde_json::Value = serde_json::from_slice(&stdout).ok()?;

    let format = &json["format"];
    let tags = &format["tags"];

    // ffprobe tag keys can be lowercase or mixed-case — try both
    let get_tag = |keys: &[&str]| -> Option<String> {
        for key in keys {
            if let Some(v) = tags[key].as_str().and_then(trim_tag) {
                return Some(v);
            }
            // Try uppercase variant
            if let Some(v) = tags[key.to_uppercase()].as_str().and_then(trim_tag) {
                return Some(v);
            }
        }
        None
    };

    let title = get_tag(&["title"]);
    let artist = get_tag(&["artist"]);
    let album = get_tag(&["album"]);
    let album_artist = get_tag(&["album_artist"]);
    // ffprobe joins multi-value genre frames with ';' or NUL depending on format
    let genre = get_tag(&["genre"]).map(|s| s.replace('\0', "; "));
    let sort_artist = get_tag(&["sort_artist"]);
    let sort_album_artist = get_tag(&["sort_album_artist"]);
    let compilation = get_tag(&["compilation"])
        .map(|s| s == "1" || s.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let (track, track_total) = tags["track"]
        .as_str()
        .map(parse_slash_pair)
        .unwrap_or((None, None));

    let (disc, disc_total) = tags["disc"]
        .as_str()
        .map(parse_slash_pair)
        .unwrap_or((None, None));

    let year = get_tag(&["date", "year"]).and_then(|s| {
        // "date" is often "2024-01-15" — extract just the year
        s.split('-')
            .next()
            .and_then(|y| y.trim().parse::<u32>().ok())
    });

    let duration_secs = format["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);

    // Get audio stream info
    let audio_stream = json["streams"].as_array().and_then(|streams| {
        streams
            .iter()
            .find(|s| s["codec_type"].as_str() == Some("audio"))
    });

    let sample_rate = audio_stream
        .and_then(|s| s["sample_rate"].as_str())
        .and_then(|s| s.parse::<u32>().ok());

    let bitrate_kbps = format["bit_rate"]
        .as_str()
        .and_then(|s| s.parse::<u64>().ok())
        .map(|b| (b / 1000) as u32);

    Some(FfprobeMetadata {
        title,
        artist,
        album,
        album_artist,
        track,
        track_total,
        disc,
        disc_total,
        year,
        genre,
        duration_secs,
        sample_rate,
        bitrate_kbps,
        sort_artist,
        sort_album_artist,
        compilation,
    })
}

/// Write metadata to a file using ffmpeg. Copies the audio stream and replaces
/// all metadata. Returns Err on failure.
pub fn write_metadata(path: &Path, updates: &[(&str, &str)]) -> Result<(), String> {
    let path_str = path.to_string_lossy();
    // The temp file must keep the original extension — ffmpeg infers the
    // output muxer from it and fails outright on an unknown extension.
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    let tmp_path = if ext.is_empty() {
        format!("{}.tmp_meta", path_str)
    } else {
        format!("{}.tmp_meta.{}", path_str, ext)
    };

    let mut args = vec![
        "-y".to_string(),
        "-i".to_string(),
        path_str.to_string(),
        "-c".to_string(),
        "copy".to_string(),
        // Clear all existing metadata so removed fields don't persist
        "-map_metadata".to_string(),
        "-1".to_string(),
    ];

    for (key, value) in updates {
        args.push("-metadata".to_string());
        args.push(format!("{}={}", key, value));
    }

    // `--` ends option parsing so an output path beginning with `-` is treated
    // as a filename, not an ffmpeg flag.
    args.push("--".to_string());
    args.push(tmp_path.clone());

    let output = Command::new("ffmpeg")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    if !output.status.success() {
        // Clean up temp file on failure
        let _ = std::fs::remove_file(&tmp_path);
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg failed: {}", stderr));
    }

    // Replace original with temp file
    std::fs::rename(&tmp_path, path).map_err(|e| {
        // Clean up temp file if rename fails
        let _ = std::fs::remove_file(&tmp_path);
        format!("Failed to replace file: {}", e)
    })?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_slash_pair_with_total() {
        assert_eq!(parse_slash_pair("3/14"), (Some(3), Some(14)));
    }

    #[test]
    fn parse_slash_pair_without_total() {
        assert_eq!(parse_slash_pair("5"), (Some(5), None));
    }

    #[test]
    fn parse_slash_pair_empty() {
        assert_eq!(parse_slash_pair(""), (None, None));
    }

    #[test]
    fn trim_tag_strips_whitespace() {
        assert_eq!(trim_tag("  hello  "), Some("hello".to_string()));
        assert_eq!(trim_tag("  "), None);
        assert_eq!(trim_tag(""), None);
    }
}
