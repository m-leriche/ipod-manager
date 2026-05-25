use rusqlite::Connection;
use strsim::jaro_winkler;

use super::db;
use super::types::{MatchStatus, WatchedArtist};
use crate::musicbrainz::{self, MbArtistSearchResult};

const AUTO_MATCH_MB_SCORE: u32 = 95;
const AUTO_MATCH_SIMILARITY: f64 = 0.90;

/// Result of searching MusicBrainz for an artist match (no DB access).
pub struct ArtistMatchResult {
    pub mbid: String,
    pub mb_name: String,
    pub status: MatchStatus,
}

/// Search MusicBrainz for the best match for a watched artist.
/// Pure network call — does not touch the database.
pub fn find_best_match(artist: &WatchedArtist) -> Result<Option<ArtistMatchResult>, String> {
    if artist.match_status != MatchStatus::Pending {
        return Ok(None);
    }

    let normalized = musicbrainz::normalize_for_search(&artist.name);
    let candidates = musicbrainz::search_artists(&normalized)?;

    if candidates.is_empty() {
        return Ok(None);
    }

    let best = &candidates[0];
    let similarity = jaro_winkler(&artist.name.to_lowercase(), &best.name.to_lowercase());

    let status = if best.score >= AUTO_MATCH_MB_SCORE && similarity >= AUTO_MATCH_SIMILARITY {
        MatchStatus::Matched
    } else {
        MatchStatus::Ambiguous
    };

    Ok(Some(ArtistMatchResult {
        mbid: best.id.clone(),
        mb_name: best.name.clone(),
        status,
    }))
}

/// Save a MusicBrainz match result to the database and return the updated artist.
pub fn save_artist_match(
    conn: &Connection,
    artist: &WatchedArtist,
    result: &ArtistMatchResult,
) -> Result<WatchedArtist, String> {
    db::set_artist_mbid(
        conn,
        artist.id,
        &result.mbid,
        &result.mb_name,
        result.status.clone(),
    )?;
    Ok(WatchedArtist {
        mb_artist_id: Some(result.mbid.clone()),
        mb_artist_name: Some(result.mb_name.clone()),
        match_status: result.status.clone(),
        ..artist.clone()
    })
}

/// Search MusicBrainz for artist candidates (for manual resolution UI).
pub fn search_artist_candidates(name: &str) -> Result<Vec<MbArtistSearchResult>, String> {
    let normalized = musicbrainz::normalize_for_search(name);
    musicbrainz::search_artists(&normalized)
}
