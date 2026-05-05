use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const USER_AGENT: &str = "Crate/1.0 (https://github.com/m-leriche/ipod-manager)";
const RATE_LIMIT: Duration = Duration::from_millis(250);
const BASE_URL: &str = "https://lrclib.net/api";

static LAST_REQUEST: Mutex<Option<Instant>> = Mutex::new(None);

// ── Types ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyricsResult {
    pub plain_lyrics: Option<String>,
    pub synced_lyrics: Option<String>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackLyrics {
    pub track_id: i64,
    pub lyrics: Option<String>,
    pub synced_lyrics: Option<String>,
    pub source: String,
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

// ── LRCLIB API ──────────────────────────────────────────────────

/// Fetch lyrics from LRCLIB by exact match (artist, title, album, duration).
pub fn fetch_from_lrclib(
    artist: &str,
    title: &str,
    album: Option<&str>,
    duration_secs: Option<f64>,
) -> Result<LyricsResult, String> {
    rate_limit();

    let mut req = ureq::get(&format!("{}/get", BASE_URL))
        .query("artist_name", artist)
        .query("track_name", title);

    if let Some(album) = album {
        req = req.query("album_name", album);
    }
    if let Some(dur) = duration_secs {
        req = req.query("duration", &format!("{}", dur.round() as u64));
    }

    let resp = req
        .set("User-Agent", USER_AGENT)
        .call()
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
    rate_limit();

    let query = format!("{} {}", artist, title);
    let resp = ureq::get(&format!("{}/search", BASE_URL))
        .query("q", &query)
        .set("User-Agent", USER_AGENT)
        .call()
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

// ── Database operations ─────────────────────────────────────────

/// Get lyrics for a track from the database.
pub fn get_lyrics(conn: &Connection, track_id: i64) -> Result<TrackLyrics, String> {
    conn.query_row(
        "SELECT id, lyrics, synced_lyrics FROM tracks WHERE id = ?1",
        params![track_id],
        |row| {
            Ok(TrackLyrics {
                track_id: row.get(0)?,
                lyrics: row.get(1)?,
                synced_lyrics: row.get(2)?,
                source: "database".to_string(),
            })
        },
    )
    .map_err(|e| format!("Track not found: {}", e))
}

/// Save lyrics to the database for a track.
pub fn save_lyrics(
    conn: &Connection,
    track_id: i64,
    lyrics: Option<&str>,
    synced_lyrics: Option<&str>,
) -> Result<(), String> {
    conn.execute(
        "UPDATE tracks SET lyrics = ?1, synced_lyrics = ?2 WHERE id = ?3",
        params![lyrics, synced_lyrics, track_id],
    )
    .map_err(|e| format!("Failed to save lyrics: {}", e))?;

    Ok(())
}

// ── Write lyrics to audio file tags ─────────────────────────────

/// Write plain lyrics back to the audio file's embedded tags.
pub fn write_lyrics_to_file(file_path: &str, lyrics: &str) -> Result<(), String> {
    let path = std::path::Path::new(file_path);
    if !path.exists() {
        return Err("File not found".to_string());
    }

    let is_mp3 = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("mp3"))
        .unwrap_or(false);

    if is_mp3 {
        write_lyrics_id3(path, lyrics)
    } else {
        write_lyrics_lofty(path, lyrics)
    }
}

fn write_lyrics_id3(path: &std::path::Path, lyrics: &str) -> Result<(), String> {
    use id3::TagLike;
    let mut tag = id3::Tag::read_from_path(path).unwrap_or_else(|_| id3::Tag::new());

    // Remove existing USLT frames
    tag.remove("USLT");

    // Add new lyrics frame
    tag.add_frame(id3::frame::Lyrics {
        lang: "eng".to_string(),
        description: String::new(),
        text: lyrics.to_string(),
    });

    tag.write_to_path(path, id3::Version::Id3v24)
        .map_err(|e| format!("Failed to write lyrics: {}", e))?;

    Ok(())
}

fn write_lyrics_lofty(path: &std::path::Path, lyrics: &str) -> Result<(), String> {
    use lofty::config::WriteOptions;
    use lofty::prelude::TagExt;
    use lofty::prelude::TaggedFileExt;
    use lofty::probe::Probe;
    use lofty::tag::ItemKey;

    let mut tagged = Probe::open(path)
        .map_err(|e| format!("Open failed: {}", e))?
        .read()
        .map_err(|e| format!("Read failed: {}", e))?;

    let tag = if let Some(t) = tagged.primary_tag_mut() {
        t
    } else {
        let tag_type = tagged.primary_tag_type();
        tagged.insert_tag(lofty::tag::Tag::new(tag_type));
        tagged.primary_tag_mut().ok_or("Failed to create tag")?
    };

    if lyrics.is_empty() {
        tag.remove_key(&ItemKey::Lyrics);
    } else {
        tag.insert_text(ItemKey::Lyrics, lyrics.to_string());
    }

    tag.save_to_path(path, WriteOptions::default())
        .map_err(|e| format!("Save failed: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rate_limit_does_not_panic() {
        rate_limit();
        rate_limit();
    }

    #[test]
    fn lyrics_result_serializes() {
        let result = LyricsResult {
            plain_lyrics: Some("Hello world".to_string()),
            synced_lyrics: Some("[00:00.00] Hello world".to_string()),
            source: "lrclib".to_string(),
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("Hello world"));
        assert!(json.contains("lrclib"));
    }

    #[test]
    fn track_lyrics_serializes() {
        let result = TrackLyrics {
            track_id: 42,
            lyrics: Some("Test lyrics".to_string()),
            synced_lyrics: None,
            source: "database".to_string(),
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("42"));
        assert!(json.contains("Test lyrics"));
    }
}
