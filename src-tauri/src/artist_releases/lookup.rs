use rusqlite::Connection;
use strsim::jaro_winkler;

use super::db;
use super::types::WatchedArtist;
use crate::musicbrainz::{self, MbArtistSearchResult};

const AUTO_MATCH_MB_SCORE: u32 = 95;
const AUTO_MATCH_SIMILARITY: f64 = 0.90;

/// Attempt to resolve a watched artist's MusicBrainz ID.
/// Returns the updated artist if resolved, or the original if ambiguous/failed.
pub fn resolve_artist_mbid(
    conn: &Connection,
    artist: &WatchedArtist,
) -> Result<WatchedArtist, String> {
    if artist.match_status != "pending" {
        return Ok(artist.clone());
    }

    let normalized = musicbrainz::normalize_for_search(&artist.name);
    let candidates = musicbrainz::search_artists(&normalized)?;

    if candidates.is_empty() {
        return Ok(artist.clone());
    }

    let best = &candidates[0];
    let similarity = jaro_winkler(&artist.name.to_lowercase(), &best.name.to_lowercase());

    if best.score >= AUTO_MATCH_MB_SCORE && similarity >= AUTO_MATCH_SIMILARITY {
        db::set_artist_mbid(conn, artist.id, &best.id, &best.name, "matched")?;
        Ok(WatchedArtist {
            mb_artist_id: Some(best.id.clone()),
            mb_artist_name: Some(best.name.clone()),
            match_status: "matched".to_string(),
            ..artist.clone()
        })
    } else {
        db::set_artist_mbid(conn, artist.id, &best.id, &best.name, "ambiguous")?;
        Ok(WatchedArtist {
            mb_artist_id: Some(best.id.clone()),
            mb_artist_name: Some(best.name.clone()),
            match_status: "ambiguous".to_string(),
            ..artist.clone()
        })
    }
}

/// Search MusicBrainz for artist candidates (for manual resolution UI).
pub fn search_artist_candidates(name: &str) -> Result<Vec<MbArtistSearchResult>, String> {
    let normalized = musicbrainz::normalize_for_search(name);
    musicbrainz::search_artists(&normalized)
}
