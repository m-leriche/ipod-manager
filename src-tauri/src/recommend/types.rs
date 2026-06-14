use serde::Serialize;

/// A single track suggested for a playlist. `in_library` tracks carry a
/// `track_id` and can be added directly; un-owned tracks are informational.
#[derive(Debug, Clone, Serialize)]
pub struct TrackRecommendation {
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub image_url: Option<String>,
    pub in_library: bool,
    pub track_id: Option<i64>,
    /// Last.fm "match" score (0..1) relative to the seed track; higher = closer.
    pub score: f64,
}
