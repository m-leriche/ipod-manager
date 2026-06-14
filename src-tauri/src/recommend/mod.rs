//! Playlist track recommendations.
//!
//! Seeds Last.fm `track.getSimilar` from the tracks currently in a playlist,
//! resolves the suggestions against the local library, and (for smart
//! playlists) keeps only on-theme results.

mod lastfm_tracks;
pub mod types;

pub use types::TrackRecommendation;

use lastfm_tracks::{fetch_similar_tracks, SimilarTrack};
use rusqlite::Connection;
use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use crate::library::types::{LibraryTrack, SmartPlaylistRuleGroup};

const SEED_SAMPLE: usize = 8; // playlist tracks used to seed Last.fm
const PER_SEED: u32 = 12; // similar tracks fetched per seed

struct Seed {
    artist: String,
    title: String,
}

/// Build recommendations for either a regular playlist or a smart playlist.
/// Exactly one of `playlist_id` / `smart_playlist_id` should be set.
pub fn recommend_for_playlist(
    conn_arc: &Arc<Mutex<Connection>>,
    playlist_id: Option<i64>,
    smart_playlist_id: Option<i64>,
    limit: usize,
) -> Result<Vec<TrackRecommendation>, String> {
    // ── Phase 1: gather seeds + exclusions (brief lock) ──
    let (mut seeds, existing, rule_ids) = {
        let conn = conn_arc.lock().map_err(|e| format!("DB lock: {}", e))?;
        gather_seeds(&conn, playlist_id, smart_playlist_id)?
    };
    if seeds.is_empty() {
        return Ok(Vec::new());
    }
    // Shuffle so each call (e.g. "refresh") seeds from a different sample of
    // the playlist and surfaces fresh recommendations.
    fastrand::shuffle(&mut seeds);

    // ── Phase 2: Last.fm fan-out (no lock held) ──
    let candidates = fetch_candidates(&seeds, &existing);
    if candidates.is_empty() {
        return Ok(Vec::new());
    }

    // ── Phase 3: resolve against library + rule-filter (brief lock) ──
    let is_smart = smart_playlist_id.is_some();
    let mut recs = {
        let conn = conn_arc.lock().map_err(|e| format!("DB lock: {}", e))?;
        resolve_candidates(&conn, candidates, is_smart, &rule_ids)
    };

    // Owned (addable) first, then by Last.fm similarity score.
    recs.sort_by(|a, b| {
        b.in_library.cmp(&a.in_library).then(
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal),
        )
    });
    recs.truncate(limit);
    Ok(recs)
}

// ── Phase 1 helpers ─────────────────────────────────────────────

#[allow(clippy::type_complexity)]
fn gather_seeds(
    conn: &Connection,
    playlist_id: Option<i64>,
    smart_playlist_id: Option<i64>,
) -> Result<(Vec<Seed>, HashSet<String>, HashSet<i64>), String> {
    let tracks: Vec<LibraryTrack> = if let Some(spid) = smart_playlist_id {
        crate::library::smart_playlists::get_smart_playlist_tracks(conn, spid)?
    } else if let Some(pid) = playlist_id {
        crate::library::playlists::get_playlist_tracks(conn, pid)?
            .into_iter()
            .map(|pt| pt.track)
            .collect()
    } else {
        return Err("No playlist specified".to_string());
    };

    let mut existing = HashSet::new();
    let mut seeds = Vec::new();
    for t in &tracks {
        if let (Some(artist), Some(title)) = (seed_artist(t), t.title.as_deref()) {
            let title = title.trim();
            if !title.is_empty() {
                existing.insert(track_key(artist, title));
                seeds.push(Seed {
                    artist: artist.to_string(),
                    title: title.to_string(),
                });
            }
        }
    }

    // Smart playlists: the full set of rule-matching track ids, used to keep
    // owned recommendations on-theme.
    let rule_ids = match smart_playlist_id {
        Some(spid) => rule_matched_ids(conn, spid)?,
        None => HashSet::new(),
    };

    Ok((seeds, existing, rule_ids))
}

fn seed_artist(t: &LibraryTrack) -> Option<&str> {
    let aa = t.album_artist.as_deref().filter(|s| !s.trim().is_empty());
    let a = t.artist.as_deref().filter(|s| !s.trim().is_empty());
    aa.or(a)
}

fn rule_matched_ids(conn: &Connection, smart_playlist_id: i64) -> Result<HashSet<i64>, String> {
    let rules_json: String = conn
        .query_row(
            "SELECT rules_json FROM smart_playlists WHERE id = ?1",
            rusqlite::params![smart_playlist_id],
            |row| row.get(0),
        )
        .map_err(|_| "Smart playlist not found".to_string())?;

    let rules: SmartPlaylistRuleGroup =
        serde_json::from_str(&rules_json).map_err(|e| format!("Invalid rules JSON: {}", e))?;

    let (where_clause, params) = crate::library::smart_playlists::rules_to_where(&rules)?;
    let sql = format!("SELECT id FROM tracks {}", where_clause);

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Query failed: {}", e))?;
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let ids = stmt
        .query_map(params_refs.as_slice(), |row| row.get::<_, i64>(0))
        .map_err(|e| format!("Query failed: {}", e))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(ids)
}

// ── Phase 2 helpers ─────────────────────────────────────────────

/// Fetch and dedupe similar-track candidates from a sample of seeds, skipping
/// anything already in the playlist. Seeds are pre-shuffled by the caller.
fn fetch_candidates(seeds: &[Seed], existing: &HashSet<String>) -> Vec<SimilarTrack> {
    let mut candidates = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    for seed in seeds.iter().take(SEED_SAMPLE) {
        let similar = match fetch_similar_tracks(&seed.artist, &seed.title, PER_SEED) {
            Ok(s) => s,
            Err(e) => {
                log::warn!(
                    "Similar tracks for '{} - {}': {}",
                    seed.artist,
                    seed.title,
                    e
                );
                continue;
            }
        };
        for st in similar {
            let k = track_key(&st.artist, &st.title);
            if existing.contains(&k) || !seen.insert(k) {
                continue;
            }
            candidates.push(st);
        }
    }
    candidates
}

// ── Phase 3 helpers ─────────────────────────────────────────────

fn resolve_candidates(
    conn: &Connection,
    candidates: Vec<SimilarTrack>,
    is_smart: bool,
    rule_ids: &HashSet<i64>,
) -> Vec<TrackRecommendation> {
    let mut out = Vec::new();
    for st in candidates {
        let found = lookup_library_track(conn, &st.artist, &st.title);
        let (in_library, track_id, album, folder_path) = match found {
            Some((id, album, folder_path)) => (true, Some(id), album, Some(folder_path)),
            None => (false, None, None, None),
        };

        // Smart playlists follow their rules: surface owned tracks only when
        // they match the rules. Un-owned discoveries can't be rule-checked, so
        // they pass through to keep the bar populated and on-theme.
        //
        // Mostly a safety net: smart-playlist seeds are the full rule-matched
        // set, so on-theme owned candidates are already excluded as existing
        // seeds in fetch_candidates. This still catches owned candidates whose
        // seed was skipped (e.g. blank title) and would otherwise leak in.
        if is_smart && in_library && !track_id.is_some_and(|id| rule_ids.contains(&id)) {
            continue;
        }

        out.push(TrackRecommendation {
            title: st.title,
            artist: st.artist,
            album,
            image_url: st.image_url,
            folder_path,
            in_library,
            track_id,
            score: st.score,
        });
    }
    out
}

fn lookup_library_track(
    conn: &Connection,
    artist: &str,
    title: &str,
) -> Option<(i64, Option<String>, String)> {
    conn.query_row(
        "SELECT id, album, folder_path FROM tracks
         WHERE lower(COALESCE(album_artist, artist)) = lower(?1)
           AND lower(title) = lower(?2)
         LIMIT 1",
        rusqlite::params![artist, title],
        |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, String>(2)?,
            ))
        },
    )
    .ok()
}

fn track_key(artist: &str, title: &str) -> String {
    format!(
        "{}|{}",
        artist.trim().to_lowercase(),
        title.trim().to_lowercase()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn track_key_is_case_and_space_insensitive() {
        assert_eq!(
            track_key("  Radiohead ", "Karma Police"),
            track_key("RADIOHEAD", "karma police")
        );
    }

    #[test]
    fn resolve_drops_off_theme_owned_tracks_for_smart_playlists() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE tracks (id INTEGER PRIMARY KEY, title TEXT, artist TEXT, album_artist TEXT, album TEXT, folder_path TEXT NOT NULL DEFAULT '');
             INSERT INTO tracks (id, title, artist, album, folder_path) VALUES (1, 'Owned A', 'Band', 'Album A', '/m/a');
             INSERT INTO tracks (id, title, artist, album, folder_path) VALUES (2, 'Owned B', 'Band', 'Album B', '/m/b');",
        )
        .unwrap();

        let candidates = vec![
            SimilarTrack {
                artist: "Band".into(),
                title: "Owned A".into(),
                image_url: None,
                score: 0.9,
            },
            SimilarTrack {
                artist: "Band".into(),
                title: "Owned B".into(),
                image_url: None,
                score: 0.8,
            },
            SimilarTrack {
                artist: "Other".into(),
                title: "Unowned".into(),
                image_url: None,
                score: 0.7,
            },
        ];
        // Only track id 1 satisfies the rules.
        let rule_ids: HashSet<i64> = [1].into_iter().collect();

        let recs = resolve_candidates(&conn, candidates, true, &rule_ids);
        // Owned A kept (matches rules), Owned B dropped (off-theme), Unowned kept (discovery).
        let titles: Vec<&str> = recs.iter().map(|r| r.title.as_str()).collect();
        assert_eq!(titles, vec!["Owned A", "Unowned"]);
        assert!(recs[0].in_library);
        assert!(!recs[1].in_library);
    }

    #[test]
    fn resolve_keeps_all_for_regular_playlists() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE tracks (id INTEGER PRIMARY KEY, title TEXT, artist TEXT, album_artist TEXT, album TEXT, folder_path TEXT NOT NULL DEFAULT '');
             INSERT INTO tracks (id, title, artist, album, folder_path) VALUES (1, 'Owned', 'Band', 'Album', '/m/o');",
        )
        .unwrap();

        let candidates = vec![
            SimilarTrack {
                artist: "Band".into(),
                title: "Owned".into(),
                image_url: None,
                score: 0.9,
            },
            SimilarTrack {
                artist: "Other".into(),
                title: "Unowned".into(),
                image_url: None,
                score: 0.7,
            },
        ];

        let recs = resolve_candidates(&conn, candidates, false, &HashSet::new());
        assert_eq!(recs.len(), 2);
        assert_eq!(recs[0].track_id, Some(1));
        assert!(recs[0].in_library);
        assert!(!recs[1].in_library);
    }
}
