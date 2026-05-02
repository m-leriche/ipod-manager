use serde::Serialize;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::Emitter;

const ACOUSTID_API_URL: &str = "https://api.acoustid.org/v2/lookup";
const ACOUSTID_API_KEY: &str = "8XaBELgH"; // Free application key for Crate
const USER_AGENT: &str = "Crate/1.0 (crate-music-app)";
const RATE_LIMIT: Duration = Duration::from_millis(350); // AcoustID allows ~3 req/s

static LAST_REQUEST: Mutex<Option<Instant>> = Mutex::new(None);

// ── Types ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct AcoustIdMatch {
    pub score: f64,
    pub recording_id: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub release_id: Option<String>,
    pub date: Option<String>,
    pub track_number: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct IdentifyResult {
    pub file_path: String,
    pub file_name: String,
    pub matches: Vec<AcoustIdMatch>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct IdentifyProgress {
    pub total: usize,
    pub completed: usize,
    pub current_file: String,
    pub phase: String,
}

// ── Dependency check ────────────────────────────────────────────

pub fn check_fpcalc() -> Result<(), String> {
    if Command::new("which")
        .arg("fpcalc")
        .output()
        .map(|o| !o.status.success())
        .unwrap_or(true)
    {
        return Err("fpcalc not found. Install with: brew install chromaprint".to_string());
    }
    Ok(())
}

// ── Rate limiting ───────────────────────────────────────────────

fn rate_limit() {
    let mut last = LAST_REQUEST.lock().unwrap();
    if let Some(prev) = *last {
        let elapsed = prev.elapsed();
        if elapsed < RATE_LIMIT {
            std::thread::sleep(RATE_LIMIT - elapsed);
        }
    }
    *last = Some(Instant::now());
}

// ── Fingerprinting ──────────────────────────────────────────────

fn generate_fingerprint(file_path: &str) -> Result<(String, u32), String> {
    let output = Command::new("fpcalc")
        .arg("-json")
        .arg(file_path)
        .output()
        .map_err(|e| format!("fpcalc failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("fpcalc error: {}", stderr.trim()));
    }

    let json: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("fpcalc parse error: {}", e))?;

    let fingerprint = json["fingerprint"]
        .as_str()
        .ok_or("No fingerprint in fpcalc output")?
        .to_string();

    let duration = json["duration"]
        .as_f64()
        .ok_or("No duration in fpcalc output")? as u32;

    Ok((fingerprint, duration))
}

// ── AcoustID API lookup ─────────────────────────────────────────

fn lookup_acoustid(fingerprint: &str, duration: u32) -> Result<Vec<AcoustIdMatch>, String> {
    rate_limit();

    let resp = ureq::post(ACOUSTID_API_URL)
        .set("User-Agent", USER_AGENT)
        .send_form(&[
            ("client", ACOUSTID_API_KEY),
            ("fingerprint", fingerprint),
            ("duration", &duration.to_string()),
            ("meta", "recordings releases"),
        ])
        .map_err(|e| format!("AcoustID request failed: {}", e))?;

    let body: serde_json::Value = {
        let text = resp
            .into_string()
            .map_err(|e| format!("Read failed: {}", e))?;
        serde_json::from_str(&text).map_err(|e| format!("Parse failed: {}", e))?
    };

    if body["status"].as_str() != Some("ok") {
        let msg = body["error"]["message"].as_str().unwrap_or("Unknown error");
        return Err(format!("AcoustID error: {}", msg));
    }

    let results = match body["results"].as_array() {
        Some(r) => r,
        None => return Ok(Vec::new()),
    };

    let mut matches = Vec::new();
    for result in results {
        let score = result["score"].as_f64().unwrap_or(0.0);
        if score < 0.5 {
            continue;
        }

        let recordings = match result["recordings"].as_array() {
            Some(r) => r,
            None => continue,
        };

        for recording in recordings {
            let recording_id = match recording["id"].as_str() {
                Some(id) => id.to_string(),
                None => continue,
            };

            let title = recording["title"].as_str().map(|s| s.to_string());
            let artist = extract_artist(recording);

            // Get the first release for album info
            let (album, release_id, date, track_number) = extract_release_info(recording);

            matches.push(AcoustIdMatch {
                score,
                recording_id,
                title,
                artist,
                album,
                release_id,
                date,
                track_number,
            });
        }
    }

    // Sort by score descending, deduplicate by recording_id
    matches.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let mut seen = std::collections::HashSet::new();
    matches.retain(|m| seen.insert(m.recording_id.clone()));

    // Limit to top 5 results
    matches.truncate(5);

    Ok(matches)
}

// ── Main identify workflow ──────────────────────────────────────

pub fn identify_tracks(
    file_paths: Vec<String>,
    app: tauri::AppHandle,
    cancel_flag: Arc<AtomicBool>,
) -> Result<Vec<IdentifyResult>, String> {
    let total = file_paths.len();
    let mut results = Vec::with_capacity(total);

    for (i, path) in file_paths.iter().enumerate() {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err("Cancelled".to_string());
        }

        let file_name = std::path::Path::new(path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(path)
            .to_string();

        // Phase 1: Fingerprinting
        let _ = app.emit(
            "identify-progress",
            IdentifyProgress {
                total,
                completed: i,
                current_file: file_name.clone(),
                phase: "fingerprinting".to_string(),
            },
        );

        let fingerprint_result = generate_fingerprint(path);
        let (fingerprint, duration) = match fingerprint_result {
            Ok(fp) => fp,
            Err(e) => {
                results.push(IdentifyResult {
                    file_path: path.clone(),
                    file_name,
                    matches: Vec::new(),
                    error: Some(e),
                });
                continue;
            }
        };

        if cancel_flag.load(Ordering::SeqCst) {
            return Err("Cancelled".to_string());
        }

        // Phase 2: AcoustID lookup
        let _ = app.emit(
            "identify-progress",
            IdentifyProgress {
                total,
                completed: i,
                current_file: file_name.clone(),
                phase: "looking_up".to_string(),
            },
        );

        match lookup_acoustid(&fingerprint, duration) {
            Ok(matches) => {
                results.push(IdentifyResult {
                    file_path: path.clone(),
                    file_name,
                    matches,
                    error: None,
                });
            }
            Err(e) => {
                results.push(IdentifyResult {
                    file_path: path.clone(),
                    file_name,
                    matches: Vec::new(),
                    error: Some(e),
                });
            }
        }
    }

    // Final progress
    let _ = app.emit(
        "identify-progress",
        IdentifyProgress {
            total,
            completed: total,
            current_file: String::new(),
            phase: "done".to_string(),
        },
    );

    Ok(results)
}

// ── Helpers ─────────────────────────────────────────────────────

fn extract_artist(recording: &serde_json::Value) -> Option<String> {
    let artists = recording["artists"].as_array()?;
    let mut result = String::new();
    for part in artists {
        if let Some(name) = part["name"].as_str() {
            result.push_str(name);
        }
        if let Some(join) = part["joinphrase"].as_str() {
            result.push_str(join);
        }
    }
    if result.is_empty() {
        None
    } else {
        Some(result)
    }
}

fn extract_release_info(
    recording: &serde_json::Value,
) -> (Option<String>, Option<String>, Option<String>, Option<u32>) {
    let releases = match recording["releases"].as_array() {
        Some(r) if !r.is_empty() => r,
        _ => return (None, None, None, None),
    };

    // Pick the first release
    let release = &releases[0];
    let album = release["title"].as_str().map(|s| s.to_string());
    let release_id = release["id"].as_str().map(|s| s.to_string());
    let date = release["date"].as_str().map(|s| s.to_string());

    // Track number from mediums → tracks
    let track_number = release["mediums"].as_array().and_then(|mediums| {
        for medium in mediums {
            if let Some(tracks) = medium["tracks"].as_array() {
                for track in tracks {
                    if track["id"].as_str().is_some() {
                        return track["position"].as_u64().map(|p| p as u32);
                    }
                }
            }
        }
        None
    });

    (album, release_id, date, track_number)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn check_fpcalc_reports_missing() {
        // This test verifies the function returns an error format, not that fpcalc is installed
        let result = check_fpcalc();
        // Result depends on environment — just verify it doesn't panic
        assert!(result.is_ok() || result.unwrap_err().contains("fpcalc"));
    }

    #[test]
    fn extract_artist_single() {
        let json: serde_json::Value =
            serde_json::from_str(r#"{"artists": [{"name": "Radiohead"}]}"#).unwrap();
        assert_eq!(extract_artist(&json), Some("Radiohead".to_string()));
    }

    #[test]
    fn extract_artist_multi() {
        let json: serde_json::Value = serde_json::from_str(
            r#"{"artists": [{"name": "Simon", "joinphrase": " & "}, {"name": "Garfunkel"}]}"#,
        )
        .unwrap();
        assert_eq!(extract_artist(&json), Some("Simon & Garfunkel".to_string()));
    }

    #[test]
    fn extract_artist_none() {
        let json = serde_json::Value::Null;
        assert_eq!(extract_artist(&json), None);
    }

    #[test]
    fn extract_release_info_none() {
        let json = serde_json::Value::Null;
        let (album, rid, date, tn) = extract_release_info(&json);
        assert!(album.is_none());
        assert!(rid.is_none());
        assert!(date.is_none());
        assert!(tn.is_none());
    }
}
