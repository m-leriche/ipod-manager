use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

use super::types::LibraryTrack;
use serde::Serialize;

// ── Types ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct DuplicateTrack {
    pub track: LibraryTrack,
    pub quality_score: f64,
    pub is_recommended: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct DuplicateGroup {
    pub group_id: usize,
    pub fingerprint: String,
    pub tracks: Vec<DuplicateTrack>,
    pub duration_mismatch: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct DuplicateDetectionResult {
    pub groups: Vec<DuplicateGroup>,
    pub total_duplicate_tracks: usize,
    pub potential_space_savings: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DuplicateDetectionProgress {
    pub phase: String,
    pub completed: usize,
    pub total: usize,
}

// ── Detection algorithm ──────────────────────────────────────

pub fn detect_duplicates(
    conn: &Connection,
    app: &AppHandle,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<DuplicateDetectionResult, String> {
    // Phase 1: Load all tracks
    emit_progress(app, "Loading tracks", 0, 1);
    let all_tracks = load_all_tracks(conn)?;
    let total = all_tracks.len();

    if cancel_flag.load(Ordering::SeqCst) {
        return Err("Cancelled".to_string());
    }

    // Phase 2: Build fingerprint map
    let mut fingerprint_map: HashMap<String, Vec<LibraryTrack>> = HashMap::new();
    let mut unmatched: Vec<LibraryTrack> = Vec::new();

    for (i, track) in all_tracks.iter().enumerate() {
        if i % 500 == 0 {
            emit_progress(app, "Fingerprinting", i, total);
            if cancel_flag.load(Ordering::SeqCst) {
                return Err("Cancelled".to_string());
            }
        }

        let title = match &track.title {
            Some(t) if !t.is_empty() => t.clone(),
            _ => {
                // No title — skip fingerprint matching
                continue;
            }
        };

        let artist = track
            .album_artist
            .as_deref()
            .or(track.artist.as_deref())
            .unwrap_or("");

        let key = fingerprint_key(&title, artist);
        if key.is_empty() {
            continue;
        }

        fingerprint_map.entry(key).or_default().push(track.clone());
    }

    // Phase 3: Collect exact-match groups, then fuzzy-match remaining
    let mut groups: Vec<DuplicateGroup> = Vec::new();
    let mut group_id = 0;

    // Exact fingerprint matches
    let mut matched_ids: std::collections::HashSet<i64> = std::collections::HashSet::new();
    for (key, tracks) in &fingerprint_map {
        if tracks.len() < 2 {
            unmatched.extend(tracks.iter().cloned());
            continue;
        }
        for t in tracks {
            matched_ids.insert(t.id);
        }
        groups.push(build_group(group_id, key.clone(), tracks.clone()));
        group_id += 1;
    }

    // Phase 3b: Fuzzy matching for unmatched tracks
    emit_progress(app, "Fuzzy matching", 0, unmatched.len());

    // Group unmatched by normalized artist for efficiency
    let mut by_artist: HashMap<String, Vec<LibraryTrack>> = HashMap::new();
    for track in &unmatched {
        let artist = track
            .album_artist
            .as_deref()
            .or(track.artist.as_deref())
            .unwrap_or("");
        let norm_artist = normalize(artist);
        by_artist
            .entry(norm_artist)
            .or_default()
            .push(track.clone());
    }

    for artist_tracks in by_artist.values() {
        if artist_tracks.len() < 2 {
            continue;
        }
        if cancel_flag.load(Ordering::SeqCst) {
            return Err("Cancelled".to_string());
        }

        // Compare all pairs within same artist
        let mut used: std::collections::HashSet<i64> = std::collections::HashSet::new();
        for (i, anchor) in artist_tracks.iter().enumerate() {
            if used.contains(&anchor.id) || matched_ids.contains(&anchor.id) {
                continue;
            }
            let title_a = normalize(anchor.title.as_deref().unwrap_or(""));
            let mut cluster = vec![anchor.clone()];

            for candidate in &artist_tracks[i + 1..] {
                if used.contains(&candidate.id) || matched_ids.contains(&candidate.id) {
                    continue;
                }
                let title_b = normalize(candidate.title.as_deref().unwrap_or(""));
                let sim = strsim::normalized_damerau_levenshtein(&title_a, &title_b);
                if sim >= 0.85 {
                    cluster.push(candidate.clone());
                    used.insert(candidate.id);
                }
            }

            if cluster.len() >= 2 {
                used.insert(anchor.id);
                let fp = format!(
                    "{}|{}",
                    title_a,
                    normalize(anchor.artist.as_deref().unwrap_or(""))
                );
                groups.push(build_group(group_id, fp, cluster));
                group_id += 1;
            }
        }
    }

    // Phase 4: Compute totals
    emit_progress(app, "Scoring", 0, groups.len());

    let total_duplicate_tracks: usize = groups.iter().map(|g| g.tracks.len()).sum();
    let potential_space_savings: u64 = groups
        .iter()
        .flat_map(|g| g.tracks.iter())
        .filter(|t| !t.is_recommended)
        .map(|t| t.track.file_size)
        .sum();

    Ok(DuplicateDetectionResult {
        groups,
        total_duplicate_tracks,
        potential_space_savings,
    })
}

// ── Helpers ──────────────────────────────────────────────────

fn normalize(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn fingerprint_key(title: &str, artist: &str) -> String {
    let nt = normalize(title);
    let na = normalize(artist);
    if nt.is_empty() {
        return String::new();
    }
    format!("{}|{}", nt, na)
}

fn quality_score(track: &LibraryTrack) -> f64 {
    let mut score = 0.0;

    // Lossless format bonus
    let format_upper = track.format.to_uppercase();
    if matches!(
        format_upper.as_str(),
        "FLAC" | "WAV" | "AIFF" | "ALAC" | "APE"
    ) {
        score += 100.0;
    }

    // Bitrate
    if let Some(br) = track.bitrate_kbps {
        score += br as f64 / 10.0;
    }

    // Sample rate
    if let Some(sr) = track.sample_rate {
        score += sr as f64 / 1000.0;
    }

    // Slight bonus for larger files (more data = potentially better quality)
    score += (track.file_size as f64 / 1_000_000.0).min(10.0);

    score
}

fn build_group(group_id: usize, fingerprint: String, tracks: Vec<LibraryTrack>) -> DuplicateGroup {
    // Check duration mismatch
    let durations: Vec<f64> = tracks.iter().map(|t| t.duration_secs).collect();
    let duration_mismatch = if durations.len() >= 2 {
        let min = durations.iter().cloned().fold(f64::INFINITY, f64::min);
        let max = durations.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        (max - min).abs() > 10.0
    } else {
        false
    };

    // Score and mark recommended
    let mut scored: Vec<DuplicateTrack> = tracks
        .into_iter()
        .map(|t| {
            let score = quality_score(&t);
            DuplicateTrack {
                track: t,
                quality_score: score,
                is_recommended: false,
            }
        })
        .collect();

    // Highest score is recommended
    if let Some(best_idx) = scored
        .iter()
        .enumerate()
        .max_by(|a, b| {
            a.1.quality_score
                .partial_cmp(&b.1.quality_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|(i, _)| i)
    {
        scored[best_idx].is_recommended = true;
    }

    DuplicateGroup {
        group_id,
        fingerprint,
        tracks: scored,
        duration_mismatch,
    }
}

fn load_all_tracks(conn: &Connection) -> Result<Vec<LibraryTrack>, String> {
    let sql = "SELECT id, file_path, file_name, folder_path, title, artist, album, album_artist,
                sort_artist, sort_album_artist, track_number, track_total, disc_number,
                disc_total, year, genre, duration_secs, sample_rate, bitrate_kbps, format,
                file_size, created_at, play_count, flagged, rating
         FROM tracks";

    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("Query failed: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(LibraryTrack {
                id: row.get(0)?,
                file_path: row.get(1)?,
                file_name: row.get(2)?,
                folder_path: row.get(3)?,
                title: row.get(4)?,
                artist: row.get(5)?,
                album: row.get(6)?,
                album_artist: row.get(7)?,
                sort_artist: row.get(8)?,
                sort_album_artist: row.get(9)?,
                track_number: row.get(10)?,
                track_total: row.get(11)?,
                disc_number: row.get(12)?,
                disc_total: row.get(13)?,
                year: row.get(14)?,
                genre: row.get(15)?,
                duration_secs: row.get(16)?,
                sample_rate: row.get(17)?,
                bitrate_kbps: row.get(18)?,
                format: row.get(19)?,
                file_size: row.get::<_, i64>(20).map(|v| v as u64)?,
                created_at: row.get(21)?,
                play_count: row.get::<_, i64>(22).map(|v| v as u32)?,
                flagged: row.get(23)?,
                rating: row.get::<_, i64>(24).map(|v| v as u8)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row read failed: {}", e))
}

fn emit_progress(app: &AppHandle, phase: &str, completed: usize, total: usize) {
    let _ = app.emit(
        "duplicate-detection-progress",
        DuplicateDetectionProgress {
            phase: phase.to_string(),
            completed,
            total,
        },
    );
}
