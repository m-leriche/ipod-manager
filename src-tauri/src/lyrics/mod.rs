mod batch;
mod database;
mod lrclib;
mod tags;

use serde::{Deserialize, Serialize};

pub(crate) use crate::network::USER_AGENT;
pub(crate) const BASE_URL: &str = "https://lrclib.net/api";

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

#[derive(Debug, Clone, Serialize)]
pub struct LyricsProgress {
    pub total: usize,
    pub completed: usize,
    pub current_track: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LyricsFetchResult {
    pub total: usize,
    pub fetched: usize,
    pub already_had: usize,
    pub not_found: usize,
    pub skipped_not_found: usize,
    pub cancelled: bool,
}

// ── Re-exports ─────────────────────────────────────────────────

pub use batch::fetch_library_lyrics;
pub use database::{
    count_lyrics_not_found, get_lyrics, remove_lyrics, reset_lyrics_not_found, save_lyrics,
};
pub use lrclib::fetch_lyrics;
pub use tags::write_lyrics_to_file;

#[cfg(test)]
mod tests {
    use super::*;

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
