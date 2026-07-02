pub mod cache;
mod genres;
pub mod normalization;
pub use cache::MbCache;
pub use genres::fetch_release_group_genres;
pub use normalization::normalize_for_search;

use serde::Serialize;
use std::io::Read;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::network::USER_AGENT;
const RATE_LIMIT: Duration = Duration::from_millis(1100);
const BASE_URL: &str = "https://musicbrainz.org/ws/2";

static LAST_REQUEST: Mutex<Option<Instant>> = Mutex::new(None);

// ── Types ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct MbRelease {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub date: Option<String>,
    pub track_count: usize,
    pub score: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct MbReleaseGroup {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub first_release_date: Option<String>,
    pub score: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct MbTrack {
    pub position: u32,
    pub title: String,
    pub artist: String,
    pub length_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MbReleaseDetail {
    pub release: MbRelease,
    pub tracks: Vec<MbTrack>,
}

// ── Rate limiting ───────────────────────────────────────────────

fn rate_limit() {
    if let Ok(mut last) = LAST_REQUEST.lock() {
        if let Some(prev) = *last {
            let elapsed = prev.elapsed();
            if elapsed < RATE_LIMIT {
                std::thread::sleep(RATE_LIMIT - elapsed);
            }
        }
        *last = Some(Instant::now());
    }
}

// ── Cached fetch ────────────────────────────────────────────────

/// Fetch a JSON body through the cache. Hits skip the rate limiter entirely;
/// misses are rate-limited, fetched, and stored on success only.
fn cached_get_json(
    cache: Option<&MbCache>,
    key: &str,
    fetch: impl FnOnce() -> Result<String, String>,
) -> Result<serde_json::Value, String> {
    if let Some(cache) = cache {
        if let Some(text) = cache.get(key) {
            if let Ok(body) = serde_json::from_str(&text) {
                return Ok(body);
            }
        }
    }

    rate_limit();
    let text = fetch()?;
    let body: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("Parse failed: {}", e))?;
    if let Some(cache) = cache {
        cache.put(key, &text);
    }
    Ok(body)
}

// ── API functions ───────────────────────────────────────────────

/// Search MusicBrainz for releases matching artist + album name.
/// Returns up to 5 candidates sorted by relevance score.
pub fn search_releases(
    artist: &str,
    album: &str,
    cache: Option<&MbCache>,
) -> Result<Vec<MbRelease>, String> {
    let key = format!("release-search:{}|{}", artist, album);
    let body = cached_get_json(cache, &key, || {
        let query = format!(
            "artist:\"{}\" AND release:\"{}\"",
            artist.replace('"', "\\\""),
            album.replace('"', "\\\""),
        );

        ureq::get(&format!("{}/release/", BASE_URL))
            .query("query", &query)
            .query("fmt", "json")
            .query("limit", "5")
            .set("User-Agent", USER_AGENT)
            .call()
            .map_err(|e| format!("Search failed: {}", e))?
            .into_string()
            .map_err(|e| format!("Read failed: {}", e))
    })?;

    let releases = body["releases"]
        .as_array()
        .ok_or_else(|| "No results from MusicBrainz".to_string())?;

    let mut results = Vec::new();
    for release in releases {
        let Some(id) = release["id"].as_str() else {
            continue;
        };
        let title = release["title"].as_str().unwrap_or("").to_string();
        let artist = extract_artist_credit(&release["artist-credit"]);
        let date = release["date"].as_str().map(|s| s.to_string());
        let track_count = release["track-count"].as_u64().unwrap_or(0) as usize;
        let score = release["score"].as_u64().unwrap_or(0) as u32;

        results.push(MbRelease {
            id: id.to_string(),
            title,
            artist,
            date,
            track_count,
            score,
        });
    }

    Ok(results)
}

/// Search MusicBrainz for release-groups (the canonical "album" concept).
/// More reliable than release search for year lookups since there's one
/// release-group per album and it carries `first-release-date`.
pub fn search_release_groups(artist: &str, album: &str) -> Result<Vec<MbReleaseGroup>, String> {
    rate_limit();

    let query = format!(
        "artist:\"{}\" AND releasegroup:\"{}\"",
        artist.replace('"', "\\\""),
        album.replace('"', "\\\""),
    );

    let resp = ureq::get(&format!("{}/release-group/", BASE_URL))
        .query("query", &query)
        .query("fmt", "json")
        .query("limit", "5")
        .set("User-Agent", USER_AGENT)
        .call()
        .map_err(|e| format!("Search failed: {}", e))?;

    let body: serde_json::Value = {
        let text = resp
            .into_string()
            .map_err(|e| format!("Read failed: {}", e))?;
        serde_json::from_str(&text).map_err(|e| format!("Parse failed: {}", e))?
    };

    let groups = body["release-groups"]
        .as_array()
        .ok_or_else(|| "No results from MusicBrainz".to_string())?;

    let mut results = Vec::new();
    for rg in groups {
        let Some(id) = rg["id"].as_str() else {
            continue;
        };
        let title = rg["title"].as_str().unwrap_or("").to_string();
        let artist = extract_artist_credit(&rg["artist-credit"]);
        let first_release_date = rg["first-release-date"].as_str().map(|s| s.to_string());
        let score = rg["score"].as_u64().unwrap_or(0) as u32;

        results.push(MbReleaseGroup {
            id: id.to_string(),
            title,
            artist,
            first_release_date,
            score,
        });
    }

    Ok(results)
}

/// Fetch full release details including track listings from MusicBrainz.
pub fn fetch_release_detail(
    mbid: &str,
    cache: Option<&MbCache>,
) -> Result<MbReleaseDetail, String> {
    let key = format!("release-detail:{}", mbid);
    let body = cached_get_json(cache, &key, || {
        let url = format!(
            "{}/release/{}?inc=recordings+artist-credits&fmt=json",
            BASE_URL, mbid
        );
        ureq::get(&url)
            .set("User-Agent", USER_AGENT)
            .call()
            .map_err(|e| format!("Fetch failed: {}", e))?
            .into_string()
            .map_err(|e| format!("Read failed: {}", e))
    })?;

    let release = MbRelease {
        id: body["id"].as_str().unwrap_or("").to_string(),
        title: body["title"].as_str().unwrap_or("").to_string(),
        artist: extract_artist_credit(&body["artist-credit"]),
        date: body["date"].as_str().map(|s| s.to_string()),
        track_count: body["media"]
            .as_array()
            .map(|m| {
                m.iter()
                    .map(|disc| disc["track-count"].as_u64().unwrap_or(0) as usize)
                    .sum()
            })
            .unwrap_or(0),
        score: 0,
    };

    let mut tracks = Vec::new();
    if let Some(media) = body["media"].as_array() {
        for disc in media {
            if let Some(track_list) = disc["tracks"].as_array() {
                for track in track_list {
                    let position = track["position"].as_u64().unwrap_or(0) as u32;
                    let title = track["title"].as_str().unwrap_or("").to_string();
                    let length_ms = track["length"].as_u64();
                    let artist = track["artist-credit"]
                        .as_array()
                        .map(|_| extract_artist_credit(&track["artist-credit"]))
                        .unwrap_or_else(|| release.artist.clone());

                    tracks.push(MbTrack {
                        position,
                        title,
                        artist,
                        length_ms,
                    });
                }
            }
        }
    }

    Ok(MbReleaseDetail { release, tracks })
}

const COVER_ART_NOT_FOUND: &str = "not-found";

/// Fetch cover art for a release from the Cover Art Archive.
/// Returns the image bytes on success, or an error string.
///
/// A 404 ("no art exists for this release") is a definitive answer, so it is
/// cached to skip the request on re-runs. Successful image bytes are not
/// cached — callers persist them as cover.jpg, which makes re-runs skip the
/// folder entirely.
pub fn fetch_cover_art(mbid: &str, cache: Option<&MbCache>) -> Result<Vec<u8>, String> {
    let key = format!("coverart:{}", mbid);
    if let Some(cache) = cache {
        if cache.get(&key).as_deref() == Some(COVER_ART_NOT_FOUND) {
            return Err("No cover art on Cover Art Archive (cached)".into());
        }
    }

    let url = format!("https://coverartarchive.org/release/{}/front-500", mbid);
    let resp = match ureq::get(&url).set("User-Agent", USER_AGENT).call() {
        Ok(resp) => resp,
        Err(ureq::Error::Status(404, _)) => {
            if let Some(cache) = cache {
                cache.put(&key, COVER_ART_NOT_FOUND);
            }
            return Err("No cover art on Cover Art Archive".into());
        }
        Err(e) => return Err(format!("Cover art fetch failed: {}", e)),
    };

    let mut bytes = Vec::new();
    resp.into_reader()
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Read failed: {}", e))?;

    Ok(bytes)
}

// ── Artist search ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct MbArtistSearchResult {
    pub id: String,
    pub name: String,
    pub disambiguation: Option<String>,
    pub score: u32,
}

/// Search MusicBrainz for an artist by name.
/// Returns up to 5 candidates sorted by relevance score.
pub fn search_artists(name: &str) -> Result<Vec<MbArtistSearchResult>, String> {
    rate_limit();

    let query = format!("artist:\"{}\"", name.replace('"', "\\\""));

    let resp = ureq::get(&format!("{}/artist/", BASE_URL))
        .query("query", &query)
        .query("fmt", "json")
        .query("limit", "5")
        .set("User-Agent", USER_AGENT)
        .call()
        .map_err(|e| format!("Artist search failed: {}", e))?;

    let body: serde_json::Value = {
        let text = resp
            .into_string()
            .map_err(|e| format!("Read failed: {}", e))?;
        serde_json::from_str(&text).map_err(|e| format!("Parse failed: {}", e))?
    };

    let artists = body["artists"]
        .as_array()
        .ok_or_else(|| "No artist results from MusicBrainz".to_string())?;

    let mut results = Vec::new();
    for artist in artists {
        let Some(id) = artist["id"].as_str() else {
            continue;
        };
        results.push(MbArtistSearchResult {
            id: id.to_string(),
            name: artist["name"].as_str().unwrap_or("").to_string(),
            disambiguation: artist["disambiguation"]
                .as_str()
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string()),
            score: artist["score"].as_u64().unwrap_or(0) as u32,
        });
    }

    Ok(results)
}

// ── Release-group browse ───────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct MbArtistReleaseGroup {
    pub id: String,
    pub title: String,
    pub primary_type: Option<String>,
    pub secondary_types: Vec<String>,
    pub first_release_date: Option<String>,
}

/// Fetch release-groups (albums/EPs) for an artist MBID.
/// Excludes singles and compilations. Returns all official release-groups
/// sorted by first-release-date descending.
/// If `date_cutoff` is provided, stops pagination early once all results in a
/// page are older than the cutoff (results are sorted newest-first by MB).
pub fn fetch_artist_release_groups(
    artist_mbid: &str,
    date_cutoff: Option<&str>,
) -> Result<Vec<MbArtistReleaseGroup>, String> {
    let mut all = Vec::new();
    let mut offset: usize = 0;
    let limit: usize = 100;

    loop {
        rate_limit();

        let resp = ureq::get(&format!("{}/release-group", BASE_URL))
            .query("artist", artist_mbid)
            .query("type", "album|ep")
            .query("fmt", "json")
            .query("limit", &limit.to_string())
            .query("offset", &offset.to_string())
            .set("User-Agent", USER_AGENT)
            .call()
            .map_err(|e| format!("Release-group fetch failed: {}", e))?;

        let body: serde_json::Value = {
            let text = resp
                .into_string()
                .map_err(|e| format!("Read failed: {}", e))?;
            serde_json::from_str(&text).map_err(|e| format!("Parse failed: {}", e))?
        };

        let groups = match body["release-groups"].as_array() {
            Some(g) => g,
            None => break,
        };

        if groups.is_empty() {
            break;
        }

        let mut all_old = true;
        for rg in groups {
            let Some(id) = rg["id"].as_str() else {
                continue;
            };

            // Parse secondary types and skip anything that isn't a
            // straightforward studio album/EP (live, remix, compilation, etc.)
            let secondary: Vec<String> = rg["secondary-types"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();

            if !secondary.is_empty() {
                continue;
            }

            let date = rg["first-release-date"]
                .as_str()
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string());

            // Track if any result in this page is recent enough
            if let (Some(d), Some(cutoff)) = (&date, date_cutoff) {
                if d.as_str() >= cutoff {
                    all_old = false;
                }
            } else {
                all_old = false;
            }

            all.push(MbArtistReleaseGroup {
                id: id.to_string(),
                title: rg["title"].as_str().unwrap_or("").to_string(),
                primary_type: rg["primary-type"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .map(|s| s.to_string()),
                secondary_types: secondary,
                first_release_date: date,
            });
        }

        let total = body["release-group-count"].as_u64().unwrap_or(0) as usize;
        offset += limit;

        // Stop fetching if all results in this page are older than the cutoff
        if (date_cutoff.is_some() && all_old) || offset >= total {
            break;
        }
    }

    // Sort by date descending (newest first), None dates last
    all.sort_by(|a, b| b.first_release_date.cmp(&a.first_release_date));

    Ok(all)
}

// ── Helpers ─────────────────────────────────────────────────────

fn extract_artist_credit(credit: &serde_json::Value) -> String {
    let Some(arr) = credit.as_array() else {
        return String::new();
    };
    let mut result = String::new();
    for part in arr {
        if let Some(name) = part["name"].as_str() {
            result.push_str(name);
        }
        if let Some(join) = part["joinphrase"].as_str() {
            result.push_str(join);
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_artist_credit_single() {
        let json: serde_json::Value =
            serde_json::from_str(r#"[{"name": "The Beatles", "joinphrase": ""}]"#).unwrap();
        assert_eq!(extract_artist_credit(&json), "The Beatles");
    }

    #[test]
    fn extract_artist_credit_multi() {
        let json: serde_json::Value = serde_json::from_str(
            r#"[{"name": "Simon", "joinphrase": " & "}, {"name": "Garfunkel", "joinphrase": ""}]"#,
        )
        .unwrap();
        assert_eq!(extract_artist_credit(&json), "Simon & Garfunkel");
    }

    #[test]
    fn extract_artist_credit_null() {
        let json = serde_json::Value::Null;
        assert_eq!(extract_artist_credit(&json), "");
    }
}
