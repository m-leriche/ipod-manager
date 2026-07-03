use crate::error::AppError;
use crate::files::SyncCancel;
use crate::musicbrainz;
use serde::{Deserialize, Serialize};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, State};

#[derive(Debug, Clone, Deserialize)]
pub struct AlbumYearQuery {
    pub artist: String,
    pub album: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AlbumYearResult {
    pub artist: String,
    pub album: String,
    pub suggested_year: Option<u32>,
    pub release_title: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct YearLookupProgress {
    completed: usize,
    total: usize,
    current: String,
}

/// Try to find the release year for an album via MusicBrainz.
/// Strategy: release-group search first (canonical album with `first-release-date`),
/// then individual release search as fallback. Both use artist+album queries.
/// Note: the fallback incurs an extra 1.1s rate-limit sleep per miss.
fn lookup_year(
    artist_norm: &str,
    album_norm: &str,
    orig_artist: &str,
    orig_album: &str,
) -> AlbumYearResult {
    let make_result = |rg: &musicbrainz::MbReleaseGroup| -> Option<AlbumYearResult> {
        let year = rg
            .first_release_date
            .as_ref()
            .filter(|d| !d.is_empty())
            .and_then(|d| d.split('-').next())
            .and_then(|y| y.parse::<u32>().ok())?;
        Some(AlbumYearResult {
            artist: orig_artist.to_string(),
            album: orig_album.to_string(),
            suggested_year: Some(year),
            release_title: Some(rg.title.clone()),
        })
    };

    // Try release-group search (best for year lookups).
    // Iterate all results — the top-scored hit sometimes lacks a date
    // (e.g. bootleg compilations), so skip those and take the first with a year.
    if let Ok(groups) = musicbrainz::search_release_groups(artist_norm, album_norm) {
        for rg in &groups {
            if let Some(result) = make_result(rg) {
                return result;
            }
        }
    }

    // Fallback: release search (sometimes has results release-group misses).
    // Same iteration — first result with a parseable date wins.
    if let Ok(releases) = musicbrainz::search_releases(artist_norm, album_norm, None) {
        for release in &releases {
            let year = release
                .date
                .as_ref()
                .filter(|d| !d.is_empty())
                .and_then(|d| d.split('-').next())
                .and_then(|y| y.parse::<u32>().ok());
            if let Some(y) = year {
                return AlbumYearResult {
                    artist: orig_artist.to_string(),
                    album: orig_album.to_string(),
                    suggested_year: Some(y),
                    release_title: Some(release.title.clone()),
                };
            }
        }
    }

    AlbumYearResult {
        artist: orig_artist.to_string(),
        album: orig_album.to_string(),
        suggested_year: None,
        release_title: None,
    }
}

#[tauri::command]
pub async fn lookup_album_years(
    albums: Vec<AlbumYearQuery>,
    app: AppHandle,
    cancel: State<'_, SyncCancel>,
) -> Result<Vec<AlbumYearResult>, AppError> {
    let flag = cancel.new_flag();

    tauri::async_runtime::spawn_blocking(move || {
        let total = albums.len();
        let mut results = Vec::with_capacity(total);

        for (i, query) in albums.iter().enumerate() {
            if flag.load(Ordering::Relaxed) {
                break;
            }

            let _ = app.emit(
                "year-lookup-progress",
                YearLookupProgress {
                    completed: i,
                    total,
                    current: format!("{} - {}", query.artist, query.album),
                },
            );

            let artist_norm = musicbrainz::normalize_for_search(&query.artist);
            let album_norm = musicbrainz::normalize_for_search(&query.album);

            let result = lookup_year(&artist_norm, &album_norm, &query.artist, &query.album);

            results.push(result);
        }

        let _ = app.emit(
            "year-lookup-progress",
            YearLookupProgress {
                completed: results.len(),
                total,
                current: String::new(),
            },
        );

        Ok::<_, String>(results)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}
