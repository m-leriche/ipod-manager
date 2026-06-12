//! Concurrent album genre lookup. Workers run the source chain per album:
//! Last.fm album tags → Last.fm artist tags (cached per artist) →
//! MusicBrainz release-group genres → no suggestion (keep current genre).
//!
//! Throttling lives in each HTTP client: `lastfm::api_get_public` enforces
//! ~4 req/s and the MusicBrainz client 1 req/1.1s, both via global mutexes,
//! so concurrent workers serialize correctly per service.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use tauri::Emitter;

use crate::musicbrainz;

use super::lastfm_tags::{album_top_tags, artist_top_tags, TagCount};
use super::whitelist::{select_genres, title_case};
use super::{
    AlbumGenreQuery, AlbumGenreResult, GenreLookupOutcome, GenreLookupProgress, MAX_GENRES,
    MIN_WEIGHT,
};

const CONCURRENT_WORKERS: usize = 6;

type ArtistTagCache = Mutex<HashMap<String, Arc<Vec<TagCount>>>>;

fn result_for(q: &AlbumGenreQuery, suggestion: Option<(String, &str)>) -> AlbumGenreResult {
    let (suggested_genres, source) = match suggestion {
        Some((genres, source)) => (Some(genres), Some(source.to_string())),
        None => (None, None),
    };
    AlbumGenreResult {
        artist: q.artist.clone(),
        album: q.album.clone(),
        current_genre: q.current_genre.clone(),
        suggested_genres,
        source,
    }
}

/// Fetch an artist's top tags once per run; failed fetches cache as empty
/// so a missing artist isn't retried for every album.
fn cached_artist_tags(artist: &str, cache: &ArtistTagCache) -> Arc<Vec<TagCount>> {
    let key = artist.to_lowercase();
    if let Ok(map) = cache.lock() {
        if let Some(tags) = map.get(&key) {
            return tags.clone();
        }
    }
    let tags = Arc::new(artist_top_tags(artist).unwrap_or_default());
    if let Ok(mut map) = cache.lock() {
        map.insert(key, tags.clone());
    }
    tags
}

fn lookup_one(q: &AlbumGenreQuery, cache: &ArtistTagCache) -> AlbumGenreResult {
    if let Ok(tags) = album_top_tags(&q.artist, &q.album) {
        let picked = select_genres(&tags, MIN_WEIGHT, MAX_GENRES);
        if !picked.is_empty() {
            return result_for(q, Some((picked.join("; "), "lastfm_album")));
        }
    }

    // Artist tags are meaningless for compilation albums
    if !q.artist.eq_ignore_ascii_case("various artists") {
        let tags = cached_artist_tags(&q.artist, cache);
        let picked = select_genres(&tags, MIN_WEIGHT, MAX_GENRES);
        if !picked.is_empty() {
            return result_for(q, Some((picked.join("; "), "lastfm_artist")));
        }
    }

    // Slow path: two MusicBrainz requests at 1 req/1.1s each
    let artist_norm = musicbrainz::normalize_for_search(&q.artist);
    let album_norm = musicbrainz::normalize_for_search(&q.album);
    if let Ok(groups) = musicbrainz::search_release_groups(&artist_norm, &album_norm) {
        if let Some(rg) = groups.first() {
            if let Ok(mut genres) = musicbrainz::fetch_release_group_genres(&rg.id) {
                genres.sort_by(|a, b| b.count.cmp(&a.count));
                let names: Vec<String> = genres
                    .iter()
                    .take(MAX_GENRES)
                    .map(|g| title_case(&g.name))
                    .collect();
                if !names.is_empty() {
                    return result_for(q, Some((names.join("; "), "musicbrainz")));
                }
            }
        }
    }

    result_for(q, None)
}

/// Look up suggested genres for each album. Never writes anything —
/// returns suggestions for the review step. Cancellation skips remaining
/// albums, echoing them back without a suggestion.
pub fn lookup_album_genres(
    queries: Vec<AlbumGenreQuery>,
    app: &tauri::AppHandle,
    cancel: &Arc<AtomicBool>,
) -> GenreLookupOutcome {
    let total = queries.len();
    let completed = AtomicUsize::new(0);
    let cache: ArtistTagCache = Mutex::new(HashMap::new());

    let num_threads = if total > 0 {
        CONCURRENT_WORKERS.min(total)
    } else {
        1
    };
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(num_threads)
        .build()
        .or_else(|e| {
            log::warn!(
                "Failed to create thread pool, falling back to sequential: {}",
                e
            );
            rayon::ThreadPoolBuilder::new().num_threads(1).build()
        });

    let pool = match pool {
        Ok(p) => p,
        Err(e) => {
            log::warn!("Failed to create fallback thread pool: {}", e);
            let results = queries.iter().map(|q| result_for(q, None)).collect();
            return GenreLookupOutcome {
                results,
                cancelled: false,
            };
        }
    };

    let results: Vec<AlbumGenreResult> = pool.install(|| {
        use rayon::prelude::*;
        queries
            .par_iter()
            .map(|q| {
                if cancel.load(Ordering::Relaxed) {
                    return result_for(q, None);
                }

                let result = lookup_one(q, &cache);

                let done = completed.fetch_add(1, Ordering::Relaxed) + 1;
                let _ = app.emit(
                    "genre-lookup-progress",
                    GenreLookupProgress {
                        completed: done,
                        total,
                        current: format!("{} — {}", q.artist, q.album),
                    },
                );
                result
            })
            .collect()
    });

    let cancelled = cancel.load(Ordering::Relaxed);
    if !cancelled {
        let _ = app.emit(
            "genre-lookup-progress",
            GenreLookupProgress {
                completed: total,
                total,
                current: String::new(),
            },
        );
    }

    GenreLookupOutcome { results, cancelled }
}
