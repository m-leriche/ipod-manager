use serde::Serialize;

use crate::metarepair::matching::select_best_release;
use crate::musicbrainz::normalize_for_search;
use crate::musicbrainz::{self, MbCache, MbRelease, MbReleaseDetail};

/// The MusicBrainz release an inbox album was checked against, plus the other
/// candidates the search returned. Fetched on demand when the user opens the
/// comparison — the scan-time tracklist check only does the cheaper search.
#[derive(Debug, Clone, Serialize)]
pub struct ReleaseComparison {
    /// The normalized artist/album actually sent to MusicBrainz, so a bad
    /// match can be traced back to the query that produced it.
    pub query_artist: String,
    pub query_album: String,
    pub detail: MbReleaseDetail,
    pub alternatives: Vec<MbRelease>,
}

pub fn compare_release(
    artist: &str,
    album: &str,
    track_count: usize,
    mbid: Option<&str>,
    cache: &MbCache,
) -> Result<ReleaseComparison, String> {
    let query_artist = normalize_for_search(artist);
    let query_album = normalize_for_search(album);

    let releases = musicbrainz::search_releases(&query_artist, &query_album, Some(cache))?;

    // An explicit mbid comes from the user picking an alternative, so it wins
    // even if the search that produced the list is now a cache miss.
    let chosen = match mbid {
        Some(id) => id.to_string(),
        None => match select_best_release(&releases, track_count) {
            Some(idx) => releases[idx].id.clone(),
            None => {
                return Err(format!(
                    "No MusicBrainz release found for “{} – {}”",
                    query_artist, query_album
                ))
            }
        },
    };

    let detail = musicbrainz::fetch_release_detail(&chosen, Some(cache))?;
    let alternatives = releases.into_iter().filter(|r| r.id != chosen).collect();

    Ok(ReleaseComparison {
        query_artist,
        query_album,
        detail,
        alternatives,
    })
}
