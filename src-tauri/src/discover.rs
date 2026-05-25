use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

const CACHE_TTL_SECS: i64 = 24 * 60 * 60;

// ── Types ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoverAlbum {
    pub name: String,
    pub artist_name: String,
    pub image_url: Option<String>,
    pub listeners: u64,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoverSection {
    pub seed_artist: String,
    pub albums: Vec<DiscoverAlbum>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SeedStrategy {
    #[default]
    Random,
    MostPlayed,
    RecentlyPlayed,
    RecentlyAdded,
}

// ── Cache ───────────────────────────────────────────────────────

fn now_epoch() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn get_cached(conn: &Connection, key: &str) -> Option<String> {
    let cutoff = now_epoch() - CACHE_TTL_SECS;
    conn.query_row(
        "SELECT data_json FROM discover_cache WHERE cache_key = ?1 AND cached_at > ?2",
        params![key, cutoff],
        |row| row.get(0),
    )
    .ok()
}

fn set_cached(conn: &Connection, key: &str, data: &str) {
    let _ = conn.execute(
        "INSERT INTO discover_cache (cache_key, data_json, cached_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(cache_key) DO UPDATE SET data_json = excluded.data_json, cached_at = excluded.cached_at",
        params![key, data, now_epoch()],
    );
}

pub fn clear_feed_cache(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "DELETE FROM discover_cache WHERE cache_key LIKE 'feed:%'",
        [],
    )
    .map_err(|e| format!("Failed to clear discover cache: {}", e))?;
    Ok(())
}

// ── Feed snapshot (persists until explicit refresh) ─────────────

const SNAPSHOT_KEY: &str = "discover_snapshot";

pub fn get_feed_snapshot(conn: &Connection) -> Option<Vec<DiscoverSection>> {
    conn.query_row(
        "SELECT data_json FROM discover_cache WHERE cache_key = ?1",
        params![SNAPSHOT_KEY],
        |row| row.get::<_, String>(0),
    )
    .ok()
    .and_then(|json| serde_json::from_str(&json).ok())
}

pub fn save_feed_snapshot(conn: &Connection, sections: &[DiscoverSection]) {
    if let Ok(json) = serde_json::to_string(sections) {
        set_cached(conn, SNAPSHOT_KEY, &json);
    }
}

pub fn clear_feed_snapshot(conn: &Connection) {
    let _ = conn.execute(
        "DELETE FROM discover_cache WHERE cache_key = ?1",
        params![SNAPSHOT_KEY],
    );
}

// ── Last.fm API calls ───────────────────────────────────────────

fn fetch_similar_artists(artist: &str, limit: u32) -> Result<Vec<(String, f64)>, String> {
    let limit_str = limit.to_string();
    let json = crate::lastfm::api_get_public(&[
        ("method", "artist.getSimilar"),
        ("artist", artist),
        ("limit", &limit_str),
        ("autocorrect", "1"),
    ])?;

    let artists = json["similarartists"]["artist"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|a| {
                    let name = a["name"].as_str()?.to_string();
                    let score = a["match"]
                        .as_str()
                        .and_then(|s| s.parse::<f64>().ok())
                        .or_else(|| a["match"].as_f64())
                        .unwrap_or(0.0);
                    Some((name, score))
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(artists)
}

fn fetch_top_albums(artist: &str, limit: u32) -> Result<Vec<DiscoverAlbum>, String> {
    let limit_str = limit.to_string();
    let json = crate::lastfm::api_get_public(&[
        ("method", "artist.getTopAlbums"),
        ("artist", artist),
        ("limit", &limit_str),
        ("autocorrect", "1"),
    ])?;

    let albums = json["topalbums"]["album"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|a| {
                    let name = a["name"].as_str()?.to_string();
                    if name == "(null)" || name.is_empty() {
                        return None;
                    }

                    let artist_name = a["artist"]["name"].as_str().unwrap_or_default().to_string();
                    let url = a["url"].as_str().unwrap_or_default().to_string();
                    let listeners = a["playcount"]
                        .as_u64()
                        .or_else(|| a["playcount"].as_str().and_then(|s| s.parse().ok()))
                        .unwrap_or(0);

                    let image_url = largest_image(a);

                    Some(DiscoverAlbum {
                        name,
                        artist_name,
                        image_url,
                        listeners,
                        url,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(albums)
}

fn fetch_tag_top_albums(tag: &str, limit: u32) -> Result<Vec<DiscoverAlbum>, String> {
    let limit_str = limit.to_string();
    let json = crate::lastfm::api_get_public(&[
        ("method", "tag.getTopAlbums"),
        ("tag", tag),
        ("limit", &limit_str),
    ])?;

    let albums = json["albums"]["album"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|a| {
                    let name = a["name"].as_str()?.to_string();
                    let artist_name = a["artist"]["name"].as_str().unwrap_or_default().to_string();
                    let url = a["url"].as_str().unwrap_or_default().to_string();

                    let image_url = largest_image(a);

                    Some(DiscoverAlbum {
                        name,
                        artist_name,
                        image_url,
                        listeners: 0,
                        url,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(albums)
}

/// Extract the largest available image URL from a Last.fm image array.
fn largest_image(item: &serde_json::Value) -> Option<String> {
    item["image"].as_array().and_then(|imgs| {
        imgs.iter().rev().find_map(|img| {
            let url = img["#text"].as_str().unwrap_or("");
            if url.is_empty() {
                None
            } else {
                Some(url.to_string())
            }
        })
    })
}

// ── Public API ──────────────────────────────────────────────────

/// Pick seed artists from the user's library using the given strategy.
pub fn get_seed_artists(
    conn: &Connection,
    count: usize,
    strategy: &SeedStrategy,
) -> Result<Vec<String>, String> {
    let sql = match strategy {
        SeedStrategy::Random => {
            "SELECT DISTINCT COALESCE(album_artist, artist) AS a
             FROM tracks
             WHERE a IS NOT NULL AND a != ''
             ORDER BY RANDOM()
             LIMIT ?1"
        }
        SeedStrategy::MostPlayed => {
            "SELECT COALESCE(album_artist, artist) AS a, SUM(play_count) AS total
             FROM tracks
             WHERE a IS NOT NULL AND a != '' AND play_count > 0
             GROUP BY a
             ORDER BY total DESC
             LIMIT ?1"
        }
        SeedStrategy::RecentlyPlayed => {
            "SELECT COALESCE(album_artist, artist) AS a, MAX(last_played) AS lp
             FROM tracks
             WHERE a IS NOT NULL AND a != '' AND last_played IS NOT NULL
             GROUP BY a
             ORDER BY lp DESC
             LIMIT ?1"
        }
        SeedStrategy::RecentlyAdded => {
            "SELECT COALESCE(album_artist, artist) AS a, MAX(created_at) AS ca
             FROM tracks
             WHERE a IS NOT NULL AND a != ''
             GROUP BY a
             ORDER BY ca DESC
             LIMIT ?1"
        }
    };

    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("Failed to query artists: {}", e))?;

    let artists: Vec<String> = stmt
        .query_map(params![count as i64], |row| row.get(0))
        .map_err(|e| format!("Failed to read artists: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(artists)
}

/// Build the discover feed. Releases the DB lock during API calls
/// so other operations aren't blocked.
///
/// Speed optimisation: fetches top albums in batches (limit=4) from
/// fewer similar artists instead of limit=1 from many, roughly halving
/// the number of Last.fm API calls.
pub fn build_discover_feed(
    conn_arc: &Arc<Mutex<Connection>>,
    seed_artists: &[String],
    albums_per_seed: usize,
) -> Result<Vec<DiscoverSection>, String> {
    // Phase 1: check cache + collect library artists (brief lock)
    let (cached_sections, uncached_seeds, library_artists) = {
        let conn = conn_arc.lock().map_err(|e| format!("DB lock: {}", e))?;

        let mut cached = Vec::new();
        let mut uncached = Vec::new();

        for seed in seed_artists {
            let cache_key = format!("feed:{}", seed.to_lowercase());
            if let Some(data) = get_cached(&conn, &cache_key) {
                if let Ok(section) = serde_json::from_str::<DiscoverSection>(&data) {
                    cached.push(section);
                    continue;
                }
            }
            uncached.push(seed.clone());
        }

        let library = get_library_artist_set(&conn);
        (cached, uncached, library)
    };

    // Phase 2: fetch from Last.fm (no DB lock held)
    let mut fetched = Vec::new();
    for seed in &uncached_seeds {
        let similar = match fetch_similar_artists(seed, 15) {
            Ok(s) => s,
            Err(e) => {
                log::warn!("Similar artists for '{}': {}", seed, e);
                continue;
            }
        };

        // Filter out the seed artist itself and artists already in the library.
        let seed_lower = seed.to_lowercase();
        let filtered: Vec<String> = similar
            .into_iter()
            .filter(|(name, _)| {
                let lower = name.to_lowercase();
                lower != seed_lower && !library_artists.contains(&lower)
            })
            .map(|(name, _)| name)
            .collect();

        // One album per artist for maximum variety. Fetch each artist's
        // #1 album — this costs one API call per artist but every card
        // is a different act.
        let mut albums = Vec::new();
        for artist_name in &filtered {
            if albums.len() >= albums_per_seed {
                break;
            }
            match fetch_top_albums(artist_name, 1) {
                Ok(top) => {
                    if let Some(album) = top.into_iter().next() {
                        if album.image_url.is_some() {
                            albums.push(album);
                        }
                    }
                }
                Err(e) => {
                    log::warn!("Top albums for '{}': {}", artist_name, e);
                }
            }
        }

        if !albums.is_empty() {
            fetched.push(DiscoverSection {
                seed_artist: seed.clone(),
                albums,
            });
        }
    }

    // Phase 3: cache new results (brief lock)
    if !fetched.is_empty() {
        if let Ok(conn) = conn_arc.lock() {
            for section in &fetched {
                let cache_key = format!("feed:{}", section.seed_artist.to_lowercase());
                if let Ok(json) = serde_json::to_string(section) {
                    set_cached(&conn, &cache_key, &json);
                }
            }
        }
    }

    let mut sections = cached_sections;
    sections.extend(fetched);
    Ok(sections)
}

/// Get top albums for a genre/tag from Last.fm.
pub fn get_tag_albums(
    conn: &Connection,
    tag: &str,
    limit: u32,
) -> Result<Vec<DiscoverAlbum>, String> {
    let cache_key = format!("tag:{}", tag.to_lowercase());
    if let Some(cached) = get_cached(conn, &cache_key) {
        if let Ok(albums) = serde_json::from_str::<Vec<DiscoverAlbum>>(&cached) {
            return Ok(albums);
        }
    }

    let albums = fetch_tag_top_albums(tag, limit)?;

    if let Ok(json) = serde_json::to_string(&albums) {
        set_cached(conn, &cache_key, &json);
    }

    Ok(albums)
}

/// Fetch a single replacement album for a dismissed card.
/// Finds the next similar artist (to `seed_artist`) whose name isn't in
/// `exclude_artists`, and returns their top album.
pub fn replace_album(
    conn_arc: &Arc<Mutex<Connection>>,
    seed_artist: &str,
    exclude_artists: &[String],
) -> Result<Option<DiscoverAlbum>, String> {
    let library_artists = {
        let conn = conn_arc.lock().map_err(|e| format!("DB lock: {}", e))?;
        get_library_artist_set(&conn)
    };

    let similar = fetch_similar_artists(seed_artist, 30)?;

    let seed_lower = seed_artist.to_lowercase();
    let exclude_set: HashSet<String> = exclude_artists.iter().map(|a| a.to_lowercase()).collect();

    for (name, _) in &similar {
        let lower = name.to_lowercase();
        if lower == seed_lower || library_artists.contains(&lower) || exclude_set.contains(&lower) {
            continue;
        }
        match fetch_top_albums(name, 1) {
            Ok(top) => {
                if let Some(album) = top.into_iter().next() {
                    if album.image_url.is_some() {
                        return Ok(Some(album));
                    }
                }
            }
            Err(e) => log::warn!("Top albums for '{}': {}", name, e),
        }
    }

    Ok(None)
}

/// Search for recommendations based on a freeform query (artist or album name).
/// Tries artist similarity first, falls back to album search to resolve an artist.
pub fn search_recommendations(
    conn_arc: &Arc<Mutex<Connection>>,
    query: &str,
    limit: usize,
) -> Result<DiscoverSection, String> {
    // Check cache
    let cache_key = format!("search:{}", query.to_lowercase());
    {
        let conn = conn_arc.lock().map_err(|e| format!("DB lock: {}", e))?;
        if let Some(cached) = get_cached(&conn, &cache_key) {
            if let Ok(section) = serde_json::from_str::<DiscoverSection>(&cached) {
                return Ok(section);
            }
        }
    }

    // Try artist.getSimilar directly (autocorrect handles fuzzy matching)
    let (resolved_name, similar_list) = match fetch_similar_artists(query, 15) {
        Ok(list) if !list.is_empty() => (query.to_string(), list),
        _ => {
            // Fall back: search for query as an album, resolve artist, then retry
            let artist = search_album_for_artist(query)?;
            let list = fetch_similar_artists(&artist, 15)?;
            (artist, list)
        }
    };

    // Build section — one album per similar artist, skip seed & library artists
    let library_artists = {
        let conn = conn_arc.lock().map_err(|e| format!("DB lock: {}", e))?;
        get_library_artist_set(&conn)
    };

    let seed_lower = resolved_name.to_lowercase();
    let filtered: Vec<String> = similar_list
        .into_iter()
        .filter(|(name, _)| {
            let lower = name.to_lowercase();
            lower != seed_lower && !library_artists.contains(&lower)
        })
        .map(|(name, _)| name)
        .collect();

    let mut albums = Vec::new();
    for artist_name in &filtered {
        if albums.len() >= limit {
            break;
        }
        match fetch_top_albums(artist_name, 1) {
            Ok(top) => {
                if let Some(album) = top.into_iter().next() {
                    if album.image_url.is_some() {
                        albums.push(album);
                    }
                }
            }
            Err(e) => log::warn!("Top albums for '{}': {}", artist_name, e),
        }
    }

    let section = DiscoverSection {
        seed_artist: resolved_name,
        albums,
    };

    // Cache result
    if let Ok(conn) = conn_arc.lock() {
        if let Ok(json) = serde_json::to_string(&section) {
            set_cached(&conn, &cache_key, &json);
        }
    }

    Ok(section)
}

/// Search Last.fm for an album and return its artist name.
fn search_album_for_artist(query: &str) -> Result<String, String> {
    let json = crate::lastfm::api_get_public(&[
        ("method", "album.search"),
        ("album", query),
        ("limit", "1"),
    ])?;

    json["results"]["albummatches"]["album"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|a| a["artist"].as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("No results for '{}'", query))
}

// ── Helpers ─────────────────────────────────────────────────────

fn get_library_artist_set(conn: &Connection) -> HashSet<String> {
    let mut set = HashSet::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT DISTINCT lower(COALESCE(album_artist, artist))
         FROM tracks WHERE artist IS NOT NULL",
    ) {
        if let Ok(rows) = stmt.query_map([], |row| row.get::<_, String>(0)) {
            for name in rows.flatten() {
                set.insert(name);
            }
        }
    }
    set
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn largest_image_picks_last_non_empty() {
        let item: serde_json::Value = serde_json::json!({
            "image": [
                {"#text": "http://small.jpg", "size": "small"},
                {"#text": "http://medium.jpg", "size": "medium"},
                {"#text": "", "size": "large"},
                {"#text": "http://extralarge.jpg", "size": "extralarge"},
            ]
        });
        assert_eq!(
            largest_image(&item),
            Some("http://extralarge.jpg".to_string())
        );
    }

    #[test]
    fn largest_image_returns_none_when_all_empty() {
        let item: serde_json::Value = serde_json::json!({
            "image": [
                {"#text": "", "size": "small"},
                {"#text": "", "size": "large"},
            ]
        });
        assert_eq!(largest_image(&item), None);
    }

    #[test]
    fn largest_image_returns_none_without_array() {
        let item: serde_json::Value = serde_json::json!({"name": "test"});
        assert_eq!(largest_image(&item), None);
    }

    #[test]
    fn seed_strategy_default_is_random() {
        assert!(matches!(SeedStrategy::default(), SeedStrategy::Random));
    }
}
