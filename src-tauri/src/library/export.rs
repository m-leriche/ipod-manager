use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

use super::playlists;
use super::smart_playlists;
use super::types::{Playlist, SmartPlaylist};

// ── Import result ──────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub tracks_updated: usize,
    pub tracks_skipped: usize,
    pub playlists_imported: usize,
    pub playlists_skipped: usize,
    pub smart_playlists_imported: usize,
    pub smart_playlists_skipped: usize,
}

// ── Types ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryExportData {
    pub exported_at: String,
    pub tracks: Vec<ExportTrack>,
    pub playlists: Vec<ExportPlaylist>,
    pub smart_playlists: Vec<SmartPlaylist>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportTrack {
    pub file_path: String,
    pub file_name: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub genre: Option<String>,
    pub year: Option<u32>,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub format: String,
    pub rating: u8,
    pub play_count: u32,
    pub last_played: Option<i64>,
    pub flagged: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportPlaylist {
    pub name: String,
    pub tracks: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExportResult {
    pub path: String,
    pub track_count: usize,
    pub playlist_count: usize,
    pub smart_playlist_count: usize,
    pub file_size: u64,
}

// ── Export ───────────────────────────────────────────────────────

pub fn export_library(conn: &Connection, output_path: &str) -> Result<ExportResult, String> {
    let dest = Path::new(output_path);
    if let Some(parent) = dest.parent() {
        if !parent.exists() {
            return Err(format!(
                "Directory does not exist: {}",
                parent.to_string_lossy()
            ));
        }
    }

    // Export tracks
    let tracks = export_tracks(conn)?;
    let track_count = tracks.len();

    // Export playlists with track file paths
    let playlists_data = playlists::get_playlists(conn)?;
    let playlists = export_playlists(conn, &playlists_data)?;
    let playlist_count = playlists.len();

    // Export smart playlists
    let smart = smart_playlists::get_smart_playlists(conn)?;
    let smart_playlist_count = smart.len();

    let now = iso8601_now();

    let data = LibraryExportData {
        exported_at: now,
        tracks,
        playlists,
        smart_playlists: smart,
    };

    let json = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("JSON serialization failed: {}", e))?;

    fs::write(dest, &json).map_err(|e| format!("Failed to write export file: {}", e))?;

    let file_size = json.len() as u64;

    Ok(ExportResult {
        path: output_path.to_string(),
        track_count,
        playlist_count,
        smart_playlist_count,
        file_size,
    })
}

// ── Import ──────────────────────────────────────────────────────

pub fn import_library(conn: &Connection, input_path: &str) -> Result<ImportResult, String> {
    let path = Path::new(input_path);
    if !path.exists() {
        return Err(format!("File not found: {}", input_path));
    }

    let content =
        fs::read_to_string(path).map_err(|e| format!("Failed to read import file: {}", e))?;

    let data: LibraryExportData =
        serde_json::from_str(&content).map_err(|e| format!("Invalid backup file: {}", e))?;

    // Wrap entire import in a transaction so a mid-import failure rolls back cleanly
    conn.execute_batch("BEGIN")
        .map_err(|e| format!("Failed to begin transaction: {}", e))?;

    match import_library_inner(conn, &data) {
        Ok(result) => {
            conn.execute_batch("COMMIT")
                .map_err(|e| format!("Failed to commit transaction: {}", e))?;
            Ok(result)
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

fn import_library_inner(
    conn: &Connection,
    data: &LibraryExportData,
) -> Result<ImportResult, String> {
    let mut tracks_updated = 0usize;
    let mut tracks_skipped = 0usize;

    // Restore track metadata (rating, play_count, flagged)
    for track in &data.tracks {
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM tracks WHERE file_path = ?1",
                [&track.file_path],
                |r| r.get(0),
            )
            .map_err(|e| format!("DB query error: {}", e))?;

        if exists {
            conn.execute(
                "UPDATE tracks SET rating = ?1, play_count = ?2, last_played = ?3, flagged = ?4 WHERE file_path = ?5",
                rusqlite::params![
                    track.rating as i64,
                    track.play_count as i64,
                    track.last_played,
                    track.flagged,
                    track.file_path,
                ],
            )
            .map_err(|e| format!("Failed to update track: {}", e))?;
            tracks_updated += 1;
        } else {
            tracks_skipped += 1;
        }
    }

    // Restore playlists
    let mut playlists_imported = 0usize;
    let mut playlists_skipped = 0usize;

    for playlist in &data.playlists {
        let already_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM playlists WHERE name = ?1",
                [&playlist.name],
                |r| r.get(0),
            )
            .map_err(|e| format!("DB query error: {}", e))?;

        if already_exists {
            playlists_skipped += 1;
            continue;
        }

        let created = playlists::create_playlist(conn, &playlist.name)?;

        // Resolve file_paths to track IDs (skip tracks not in the library)
        let mut track_ids = Vec::new();
        for fp in &playlist.tracks {
            if let Ok(id) =
                conn.query_row("SELECT id FROM tracks WHERE file_path = ?1", [fp], |r| {
                    r.get::<_, i64>(0)
                })
            {
                track_ids.push(id);
            }
        }

        if !track_ids.is_empty() {
            playlists::add_tracks_to_playlist(conn, created.id, &track_ids)?;
        }

        playlists_imported += 1;
    }

    // Restore smart playlists (skip built-ins)
    let mut smart_playlists_imported = 0usize;
    let mut smart_playlists_skipped = 0usize;

    for sp in &data.smart_playlists {
        if sp.is_builtin {
            smart_playlists_skipped += 1;
            continue;
        }

        let already_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM smart_playlists WHERE name = ?1",
                [&sp.name],
                |r| r.get(0),
            )
            .map_err(|e| format!("DB query error: {}", e))?;

        if already_exists {
            smart_playlists_skipped += 1;
            continue;
        }

        smart_playlists::create_smart_playlist(
            conn,
            &sp.name,
            &sp.rules,
            sp.sort_by.as_deref(),
            sp.sort_direction.as_deref(),
            sp.track_limit,
        )?;

        smart_playlists_imported += 1;
    }

    Ok(ImportResult {
        tracks_updated,
        tracks_skipped,
        playlists_imported,
        playlists_skipped,
        smart_playlists_imported,
        smart_playlists_skipped,
    })
}

// ── Helpers ─────────────────────────────────────────────────────

fn export_tracks(conn: &Connection) -> Result<Vec<ExportTrack>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT file_path, file_name, title, artist, album, album_artist, genre,
                    year, track_number, disc_number, format, rating, play_count, last_played, flagged
             FROM tracks ORDER BY file_path",
        )
        .map_err(|e| format!("DB error: {}", e))?;

    let rows = stmt
        .query_map([], |r| {
            Ok(ExportTrack {
                file_path: r.get(0)?,
                file_name: r.get(1)?,
                title: r.get(2)?,
                artist: r.get(3)?,
                album: r.get(4)?,
                album_artist: r.get(5)?,
                genre: r.get(6)?,
                year: r.get(7)?,
                track_number: r.get(8)?,
                disc_number: r.get(9)?,
                format: r.get::<_, Option<String>>(10)?.unwrap_or_default(),
                rating: r.get::<_, i64>(11).map(|v| v as u8)?,
                play_count: r.get::<_, i64>(12).map(|v| v as u32)?,
                last_played: r.get(13)?,
                flagged: r.get(14)?,
            })
        })
        .map_err(|e| format!("DB error: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row read failed: {}", e))
}

fn export_playlists(
    conn: &Connection,
    playlists_data: &[Playlist],
) -> Result<Vec<ExportPlaylist>, String> {
    let mut result = Vec::with_capacity(playlists_data.len());

    for pl in playlists_data {
        let tracks = playlists::get_playlist_tracks(conn, pl.id)?;
        let track_paths: Vec<String> = tracks.into_iter().map(|pt| pt.track.file_path).collect();
        result.push(ExportPlaylist {
            name: pl.name.clone(),
            tracks: track_paths,
        });
    }

    Ok(result)
}

fn iso8601_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Convert epoch seconds to ISO 8601 UTC without external crates
    let days = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    // Days since 1970-01-01 → year/month/day
    let (year, month, day) = days_to_ymd(days);

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hours, minutes, seconds
    )
}

fn days_to_ymd(mut days: u64) -> (u64, u64, u64) {
    // Algorithm from http://howardhinnant.github.io/date_algorithms.html
    days += 719468;
    let era = days / 146097;
    let doe = days - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

#[cfg(test)]
#[path = "export_tests.rs"]
mod tests;
