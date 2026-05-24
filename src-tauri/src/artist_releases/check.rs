use rusqlite::Connection;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use strsim::jaro_winkler;
use tauri::{AppHandle, Emitter};

use super::types::{NewReleasesCheckProgress, NewReleasesCheckResult};
use super::{db, lookup};
use crate::library;
use crate::musicbrainz;

const IN_LIBRARY_SIMILARITY: f64 = 0.85;
/// One month in seconds — how far back to look for releases on initial watch.
const INITIAL_LOOKBACK_SECS: i64 = 30 * 24 * 60 * 60;
/// 30-day buffer for subsequent checks to catch anything since the last check.
const CHECK_BUFFER_SECS: i64 = 30 * 24 * 60 * 60;

/// Check all watched artists for new releases.
/// Emits `"new-releases-check-progress"` events during the process.
pub fn check_new_releases(
    conn_arc: &Arc<Mutex<Connection>>,
    app: &AppHandle,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<NewReleasesCheckResult, String> {
    // One-time migration: clear stale data when filter criteria change.
    // Bump this version whenever the MB query or filtering logic changes.
    const FILTER_VERSION: &str = "3";
    {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        let current = library::get_setting(&conn, "releases_filter_version");
        if current.as_deref() != Some(FILTER_VERSION) {
            db::clear_discovered_releases(&conn)?;
            library::set_setting(&conn, "releases_filter_version", FILTER_VERSION)?;
        }
    }

    let artists = {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        db::get_watched_artists(&conn)?
    };

    let total = artists.len();
    let mut checked = 0usize;
    let mut new_found = 0usize;
    let mut failed = 0usize;

    for artist in &artists {
        if cancel_flag.load(Ordering::SeqCst) {
            return Ok(NewReleasesCheckResult {
                artists_checked: checked,
                new_releases_found: new_found,
                failed_lookups: failed,
                cancelled: true,
            });
        }

        // Phase 1: Resolve MBID if pending
        let resolved = if artist.match_status == "pending" {
            let _ = app.emit(
                "new-releases-check-progress",
                NewReleasesCheckProgress {
                    total_artists: total,
                    completed_artists: checked,
                    current_artist: artist.name.clone(),
                    phase: "resolving_mbid".to_string(),
                },
            );

            let conn = conn_arc
                .lock()
                .map_err(|e| format!("DB lock failed: {}", e))?;
            match lookup::resolve_artist_mbid(&conn, artist) {
                Ok(a) => a,
                Err(_) => {
                    failed += 1;
                    checked += 1;
                    continue;
                }
            }
        } else {
            artist.clone()
        };

        // Skip if no MBID available
        let mbid = match &resolved.mb_artist_id {
            Some(id) if !id.is_empty() => id.clone(),
            _ => {
                failed += 1;
                checked += 1;
                continue;
            }
        };

        // Only fetch releases for matched or manually set artists
        if resolved.match_status != "matched" && resolved.match_status != "manual" {
            checked += 1;
            continue;
        }

        if cancel_flag.load(Ordering::SeqCst) {
            return Ok(NewReleasesCheckResult {
                artists_checked: checked,
                new_releases_found: new_found,
                failed_lookups: failed,
                cancelled: true,
            });
        }

        // Phase 2: Fetch release-groups
        let _ = app.emit(
            "new-releases-check-progress",
            NewReleasesCheckProgress {
                total_artists: total,
                completed_artists: checked,
                current_artist: artist.name.clone(),
                phase: "fetching_releases".to_string(),
            },
        );

        // Compute date cutoff to avoid importing full discography
        let cutoff = release_date_cutoff(artist.created_at, artist.last_checked_at);

        match musicbrainz::fetch_artist_release_groups(&mbid, Some(cutoff.as_str())) {
            Ok(release_groups) => {
                let conn = conn_arc
                    .lock()
                    .map_err(|e| format!("DB lock failed: {}", e))?;

                for rg in &release_groups {
                    // Skip undated releases (likely old) and releases before the cutoff
                    if !passes_recency_filter(rg.first_release_date.as_deref(), &cutoff) {
                        continue;
                    }

                    let inserted = db::upsert_discovered_release(
                        &conn,
                        resolved.id,
                        &rg.id,
                        &rg.title,
                        resolved.mb_artist_name.as_deref().unwrap_or(&artist.name),
                        rg.primary_type.as_deref(),
                        rg.first_release_date.as_deref(),
                    )?;
                    if inserted {
                        new_found += 1;
                    }
                }

                db::update_last_checked(&conn, resolved.id)?;
            }
            Err(_) => {
                failed += 1;
            }
        }

        checked += 1;
    }

    // Cross-reference with local library
    {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        cross_reference_library(&conn)?;

        // Record last check timestamp
        library::set_setting(
            &conn,
            "last_releases_check",
            &format!(
                "{}",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs()
            ),
        )?;
    }

    let _ = app.emit(
        "new-releases-check-progress",
        NewReleasesCheckProgress {
            total_artists: total,
            completed_artists: total,
            current_artist: String::new(),
            phase: "done".to_string(),
        },
    );

    Ok(NewReleasesCheckResult {
        artists_checked: checked,
        new_releases_found: new_found,
        failed_lookups: failed,
        cancelled: false,
    })
}

/// Compute a YYYY-MM-DD cutoff string for filtering releases.
/// - First check (last_checked_at == 0): go back 2 years from watch date.
/// - Subsequent checks: go back 30 days from last check as a buffer.
fn release_date_cutoff(created_at: i64, last_checked_at: i64) -> String {
    let cutoff_epoch = if last_checked_at == 0 {
        created_at - INITIAL_LOOKBACK_SECS
    } else {
        last_checked_at - CHECK_BUFFER_SECS
    };
    epoch_to_date_string(cutoff_epoch.max(0))
}

/// Convert epoch seconds to "YYYY-MM-DD" string.
fn epoch_to_date_string(epoch: i64) -> String {
    let days = epoch / 86400;
    // Approximate: good enough for a 2-year cutoff comparison
    let year = 1970 + (days / 365) as i32;
    let remaining = (days % 365) as u32;
    let month = (remaining / 30).min(11) + 1;
    let day = (remaining % 30).min(27) + 1;
    format!("{:04}-{:02}-{:02}", year, month, day)
}

/// Check if a release date passes the recency filter.
/// Dates are YYYY, YYYY-MM, or YYYY-MM-DD from MusicBrainz.
/// Returns false for undated releases.
fn passes_recency_filter(date: Option<&str>, cutoff: &str) -> bool {
    let date = match date {
        Some(d) if !d.is_empty() => d,
        _ => return false,
    };
    // MB dates are lexicographically comparable (YYYY >= YYYY-MM-DD works fine)
    date >= cutoff
}

/// Mark discovered releases that match local library albums as `in_library`.
fn cross_reference_library(conn: &Connection) -> Result<(), String> {
    let local_albums = db::get_local_albums(conn)?;
    let releases = db::get_discovered_releases(conn, true)?;

    for release in &releases {
        let matched = local_albums.iter().any(|(album, artist)| {
            let title_sim = jaro_winkler(&release.title.to_lowercase(), &album.to_lowercase());
            let artist_sim =
                jaro_winkler(&release.artist_name.to_lowercase(), &artist.to_lowercase());
            title_sim >= IN_LIBRARY_SIMILARITY && artist_sim >= IN_LIBRARY_SIMILARITY
        });

        if matched != release.in_library {
            db::mark_in_library(conn, release.id, matched)?;
        }
    }

    Ok(())
}
