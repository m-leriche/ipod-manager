mod cache;
mod lastfm_api;
pub mod types;

pub use cache::{clear_feed_cache, clear_feed_snapshot, get_feed_snapshot, save_feed_snapshot};
pub use types::{DiscoverAlbum, DiscoverSection, SeedStrategy};

use cache::{get_cached, set_cached};
use lastfm_api::{
    fetch_similar_artists, fetch_tag_top_albums, fetch_top_albums, search_album_for_artist,
};

use rusqlite::{params, Connection};
use std::collections::HashSet;
use std::sync::{Arc, Mutex};

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

        // One album per artist for maximum variety.
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

/// Pick a new random seed artist (excluding `exclude_seeds`) and build a section for it.
pub fn replace_section(
    conn_arc: &Arc<Mutex<Connection>>,
    exclude_seeds: &[String],
    albums_per_seed: usize,
) -> Result<Option<DiscoverSection>, String> {
    let exclude_set: HashSet<String> = exclude_seeds.iter().map(|s| s.to_lowercase()).collect();

    // Pick random candidates and find the first one not in the exclude list
    let seed = {
        let conn = conn_arc.lock().map_err(|e| format!("DB lock: {}", e))?;
        let candidates = get_seed_artists(&conn, 20, &SeedStrategy::Random)?;
        candidates
            .into_iter()
            .find(|a| !exclude_set.contains(&a.to_lowercase()))
    };

    let seed = match seed {
        Some(s) => s,
        None => return Ok(None),
    };

    let sections = build_discover_feed(conn_arc, &[seed], albums_per_seed)?;
    Ok(sections.into_iter().next())
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
    fn seed_strategy_default_is_random() {
        assert!(matches!(SeedStrategy::default(), SeedStrategy::Random));
    }
}
