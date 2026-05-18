mod parser;
mod reader;
#[cfg(test)]
mod tests;
mod writer;

use serde::Serialize;

pub use reader::read_rockbox_playdata;
pub use writer::{write_rockbox_playdata, RockboxTrackUpdate, WriteResult};

// ── Public Types ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct RockboxPlayData {
    pub total_tracks: usize,
    pub tracks: Vec<RockboxTrack>,
    pub max_serial: i32,
    pub rating_distribution: Vec<RatingEntry>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RockboxTrack {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub filename: String,
    pub genre: String,
    pub year: i32,
    pub track_number: i32,
    pub bitrate: i32,
    pub length_ms: i32,
    pub playcount: i32,
    pub rating: i32,
    pub playtime_ms: i32,
    pub lastplayed: i32,
    pub lastplayed_rank: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct RatingEntry {
    pub rating: i32,
    pub count: usize,
}
