use rusqlite::Connection;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use strsim::jaro_winkler;
use tauri::{AppHandle, Emitter};

use super::types::{NewReleasesCheckProgress, NewReleasesCheckResult};
use super::{db, lookup};
use crate::musicbrainz;

const IN_LIBRARY_SIMILARITY: f64 = 0.85;

/// Check all watched artists for new releases.
/// Emits `"new-releases-check-progress"` events during the process.
pub fn check_new_releases(
    conn_arc: &Arc<Mutex<Connection>>,
    app: &AppHandle,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<NewReleasesCheckResult, String> {
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

        match musicbrainz::fetch_artist_release_groups(&mbid) {
            Ok(release_groups) => {
                let conn = conn_arc
                    .lock()
                    .map_err(|e| format!("DB lock failed: {}", e))?;

                for rg in &release_groups {
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
