//! Album genre lookup: Last.fm top tags filtered against a genre whitelist,
//! with a MusicBrainz release-group fallback. Lookup only suggests — applying
//! goes through the normal `save_metadata` path.

mod batch;
mod lastfm_tags;
#[cfg(test)]
mod tests;
mod whitelist;

pub use batch::lookup_album_genres;

use serde::{Deserialize, Serialize};

/// Minimum Last.fm tag weight (0-100) for a tag to count — beets' default.
pub(crate) const MIN_WEIGHT: u32 = 10;
/// Maximum number of genres in a suggestion.
pub(crate) const MAX_GENRES: usize = 3;

#[derive(Debug, Clone, Deserialize)]
pub struct AlbumGenreQuery {
    pub artist: String,
    pub album: String,
    pub current_genre: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AlbumGenreResult {
    pub artist: String,
    pub album: String,
    pub current_genre: Option<String>,
    /// "; "-joined suggestion, or None when no source had usable genres
    /// (the album keeps its current genre).
    pub suggested_genres: Option<String>,
    /// "lastfm_album" | "lastfm_artist" | "musicbrainz"
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GenreLookupOutcome {
    pub results: Vec<AlbumGenreResult>,
    pub cancelled: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct GenreLookupProgress {
    pub completed: usize,
    pub total: usize,
    pub current: String,
}
