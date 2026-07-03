use super::{LyricsResult, BASE_URL, USER_AGENT};
use crate::network::{fetch_with_retry, FetchError};

/// Fetch lyrics from LRCLIB by exact match (artist, title, album, duration).
pub fn fetch_from_lrclib(
    artist: &str,
    title: &str,
    album: Option<&str>,
    duration_secs: Option<f64>,
) -> Result<LyricsResult, String> {
    let mut req = ureq::get(&format!("{}/get", BASE_URL))
        .query("artist_name", artist)
        .query("track_name", title);

    if let Some(album) = album {
        req = req.query("album_name", album);
    }
    if let Some(dur) = duration_secs {
        req = req.query("duration", &format!("{}", dur.round() as u64));
    }

    let req = req.set("User-Agent", USER_AGENT);
    let resp = fetch_with_retry(|| req.clone().call().map_err(FetchError::from))
        .map_err(|e| format!("LRCLIB request failed: {}", e))?;

    let body: serde_json::Value = {
        let text = resp
            .into_string()
            .map_err(|e| format!("Read failed: {}", e))?;
        serde_json::from_str(&text).map_err(|e| format!("Parse failed: {}", e))?
    };

    let plain = body["plainLyrics"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let synced = body["syncedLyrics"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    if plain.is_none() && synced.is_none() {
        return Err("No lyrics found on LRCLIB".to_string());
    }

    Ok(LyricsResult {
        plain_lyrics: plain,
        synced_lyrics: synced,
        source: "lrclib".to_string(),
    })
}

/// Search LRCLIB for lyrics when exact match fails.
pub fn search_lrclib(artist: &str, title: &str) -> Result<LyricsResult, String> {
    let query = format!("{} {}", artist, title);
    let req = ureq::get(&format!("{}/search", BASE_URL))
        .query("q", &query)
        .set("User-Agent", USER_AGENT);
    let resp = fetch_with_retry(|| req.clone().call().map_err(FetchError::from))
        .map_err(|e| format!("LRCLIB search failed: {}", e))?;

    let body: serde_json::Value = {
        let text = resp
            .into_string()
            .map_err(|e| format!("Read failed: {}", e))?;
        serde_json::from_str(&text).map_err(|e| format!("Parse failed: {}", e))?
    };

    let results = body
        .as_array()
        .ok_or_else(|| "No results from LRCLIB".to_string())?;

    // Find the first result that has lyrics
    for result in results {
        let plain = result["plainLyrics"]
            .as_str()
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
        let synced = result["syncedLyrics"]
            .as_str()
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());

        if plain.is_some() || synced.is_some() {
            return Ok(LyricsResult {
                plain_lyrics: plain,
                synced_lyrics: synced,
                source: "lrclib".to_string(),
            });
        }
    }

    Err("No lyrics found on LRCLIB".to_string())
}

/// Try exact match first, then fall back to search.
pub fn fetch_lyrics(
    artist: &str,
    title: &str,
    album: Option<&str>,
    duration_secs: Option<f64>,
) -> Result<LyricsResult, String> {
    match fetch_from_lrclib(artist, title, album, duration_secs) {
        Ok(result) => Ok(result),
        Err(_) => search_lrclib(artist, title),
    }
}
