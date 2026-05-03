use serde::Serialize;
use std::io::Read;
use std::sync::Mutex;
use std::time::{Duration, Instant};

const USER_AGENT: &str = "iPodManager/1.0 (ipod-manager-app)";
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

// ── API functions ───────────────────────────────────────────────

/// Search MusicBrainz for releases matching artist + album name.
/// Returns up to 5 candidates sorted by relevance score.
pub fn search_releases(artist: &str, album: &str) -> Result<Vec<MbRelease>, String> {
    rate_limit();

    let query = format!(
        "artist:\"{}\" AND release:\"{}\"",
        artist.replace('"', "\\\""),
        album.replace('"', "\\\""),
    );

    let resp = ureq::get(&format!("{}/release/", BASE_URL))
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

/// Fetch full release details including track listings from MusicBrainz.
pub fn fetch_release_detail(mbid: &str) -> Result<MbReleaseDetail, String> {
    rate_limit();

    let url = format!(
        "{}/release/{}?inc=recordings+artist-credits&fmt=json",
        BASE_URL, mbid
    );
    let resp = ureq::get(&url)
        .set("User-Agent", USER_AGENT)
        .call()
        .map_err(|e| format!("Fetch failed: {}", e))?;

    let body: serde_json::Value = {
        let text = resp
            .into_string()
            .map_err(|e| format!("Read failed: {}", e))?;
        serde_json::from_str(&text).map_err(|e| format!("Parse failed: {}", e))?
    };

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

/// Fetch cover art for a release from the Cover Art Archive.
/// Returns the image bytes on success, or an error string.
pub fn fetch_cover_art(mbid: &str) -> Result<Vec<u8>, String> {
    let url = format!("https://coverartarchive.org/release/{}/front-500", mbid);
    let resp = ureq::get(&url)
        .set("User-Agent", USER_AGENT)
        .call()
        .map_err(|e| format!("Cover art fetch failed: {}", e))?;

    let mut bytes = Vec::new();
    resp.into_reader()
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Read failed: {}", e))?;

    Ok(bytes)
}

// ── Name normalization ──────────────────────────────────────────

/// Known noise words that appear inside parentheses/brackets and hurt search.
const NOISE_PREFIXES: &[&str] = &[
    "disc ",
    "disk ",
    "cd ",
    "deluxe",
    "remaster",
    "special edition",
    "expanded edition",
    "limited edition",
    "bonus track",
    "bonus disc",
    "anniversary",
    "super deluxe",
    "explicit",
    "clean version",
    "collector",
    "platinum edition",
    "gold edition",
    "standard edition",
    "international version",
    "uk version",
    "us version",
    "japanese edition",
    "japan edition",
];

/// Returns true if the inner text of a bracketed group is search noise.
fn is_noise(inner: &str) -> bool {
    let lower = inner.trim().to_lowercase();
    if lower.is_empty() {
        return false;
    }
    for prefix in NOISE_PREFIXES {
        if lower.starts_with(prefix) {
            return true;
        }
    }
    // Year-prefixed remaster: "2021 remaster", "2021 remastered version"
    if lower.len() >= 4
        && lower.as_bytes()[..4].iter().all(|b| b.is_ascii_digit())
        && lower.contains("remaster")
    {
        return true;
    }
    false
}

/// Strip one bracketed/parenthesized noise group from the string.
/// Returns None if nothing was stripped.
fn strip_one_noise_group(s: &str) -> Option<String> {
    for (open, close) in [('(', ')'), ('[', ']')] {
        if let Some(start) = s.find(open) {
            if let Some(rel_end) = s[start + 1..].find(close) {
                let inner = &s[start + 1..start + 1 + rel_end];
                if is_noise(inner) {
                    let mut result = s[..start].to_string();
                    result.push_str(&s[start + 1 + rel_end + 1..]);
                    return Some(result);
                }
            }
        }
    }
    None
}

/// Normalize an album or artist name for MusicBrainz search.
/// Strips disc indicators, edition markers, remaster tags, etc.
pub fn normalize_for_search(name: &str) -> String {
    let mut result = name.to_string();

    // Repeatedly strip noise groups (handles multiple like "(Disc 1) (Deluxe)")
    while let Some(stripped) = strip_one_noise_group(&result) {
        result = stripped;
    }

    // Collapse whitespace and trim
    result.split_whitespace().collect::<Vec<_>>().join(" ")
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

    #[test]
    fn normalize_strips_disc_number() {
        assert_eq!(normalize_for_search("Abbey Road (Disc 1)"), "Abbey Road");
        assert_eq!(normalize_for_search("Abbey Road [Disc 2]"), "Abbey Road");
        assert_eq!(normalize_for_search("Abbey Road (CD 1)"), "Abbey Road");
    }

    #[test]
    fn normalize_strips_edition_markers() {
        assert_eq!(normalize_for_search("Rumours (Deluxe Edition)"), "Rumours");
        assert_eq!(
            normalize_for_search("OK Computer [Remastered]"),
            "OK Computer"
        );
        assert_eq!(
            normalize_for_search("Kind of Blue (Special Edition)"),
            "Kind of Blue"
        );
        assert_eq!(
            normalize_for_search("Let It Be (Super Deluxe Edition)"),
            "Let It Be"
        );
    }

    #[test]
    fn normalize_strips_year_remaster() {
        assert_eq!(
            normalize_for_search("Dark Side of the Moon (2011 Remaster)"),
            "Dark Side of the Moon"
        );
        assert_eq!(
            normalize_for_search("Wish You Were Here [2021 Remastered Version]"),
            "Wish You Were Here"
        );
    }

    #[test]
    fn normalize_strips_multiple_noise_groups() {
        assert_eq!(
            normalize_for_search("Abbey Road (Disc 1) (Deluxe Edition)"),
            "Abbey Road"
        );
    }

    #[test]
    fn normalize_preserves_meaningful_parens() {
        assert_eq!(
            normalize_for_search("What's Going On (Original)"),
            "What's Going On (Original)"
        );
        assert_eq!(
            normalize_for_search("Music (Songs from the Motion Picture)"),
            "Music (Songs from the Motion Picture)"
        );
    }

    #[test]
    fn normalize_trims_whitespace() {
        assert_eq!(
            normalize_for_search("  Abbey Road  (Disc 1)  "),
            "Abbey Road"
        );
    }

    #[test]
    fn normalize_no_change_for_clean_name() {
        assert_eq!(normalize_for_search("Abbey Road"), "Abbey Road");
        assert_eq!(normalize_for_search("OK Computer"), "OK Computer");
    }
}
