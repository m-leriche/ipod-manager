use std::process::Command;

use super::{validate_url, Chapter, VideoInfo};

pub fn fetch_video_info(url: &str) -> Result<VideoInfo, String> {
    validate_url(url)?;

    let output = Command::new("yt-dlp")
        .args(["--ignore-config", "--dump-json", "--no-download", "--", url])
        .output()
        .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp error: {}", stderr.trim()));
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse video info: {}", e))?;

    let title = json["title"]
        .as_str()
        .unwrap_or("Unknown title")
        .to_string();

    let duration_secs = json["duration"].as_f64().unwrap_or(0.0) as u64;
    let mins = duration_secs / 60;
    let secs = duration_secs % 60;
    let duration = format!("{}:{:02}", mins, secs);

    let uploader = json["uploader"]
        .as_str()
        .or_else(|| json["channel"].as_str())
        .unwrap_or("Unknown")
        .to_string();

    let chapters = json["chapters"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|ch| {
                    Some(Chapter {
                        title: ch["title"].as_str()?.to_string(),
                        start_time: ch["start_time"].as_f64()?,
                        end_time: ch["end_time"].as_f64()?,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(VideoInfo {
        title,
        duration,
        uploader,
        chapters,
    })
}
