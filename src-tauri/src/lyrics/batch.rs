use rusqlite::{params, Connection};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::Emitter;

use super::database::{count_lyrics_not_found, save_lyrics};
use super::lrclib::fetch_lyrics;
use super::tags::write_lyrics_to_file;
use super::{LyricsFetchResult, LyricsProgress};

const CONCURRENT_WORKERS: usize = 6;
const REQUEST_THROTTLE: Duration = Duration::from_millis(50);

/// A track row from the database with just enough info to fetch lyrics.
struct TrackRow {
    id: i64,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    duration_secs: f64,
    file_name: String,
    file_path: String,
}

/// Global throttle: ensures at least `REQUEST_THROTTLE` between any two requests.
fn global_throttle(last_request: &Mutex<Instant>) {
    if let Ok(mut last) = last_request.lock() {
        let elapsed = last.elapsed();
        if elapsed < REQUEST_THROTTLE {
            std::thread::sleep(REQUEST_THROTTLE - elapsed);
        }
        *last = Instant::now();
    }
}

/// Process a single track: fetch lyrics, save to DB, embed in file.
fn process_track(
    track: &TrackRow,
    conn_arc: &Arc<Mutex<Connection>>,
    last_request: &Mutex<Instant>,
    fetched: &AtomicUsize,
    not_found_count: &AtomicUsize,
) {
    global_throttle(last_request);

    let artist = track.artist.as_deref().unwrap_or("");
    let title = track.title.as_deref().unwrap_or("");

    match fetch_lyrics(
        artist,
        title,
        track.album.as_deref(),
        Some(track.duration_secs),
    ) {
        Ok(result) => {
            if let Ok(conn) = conn_arc.lock() {
                if let Err(e) = save_lyrics(
                    &conn,
                    track.id,
                    result.plain_lyrics.as_deref(),
                    result.synced_lyrics.as_deref(),
                ) {
                    log::warn!("Failed to save lyrics for track {}: {}", track.id, e);
                }
            }
            if let Some(ref plain) = result.plain_lyrics {
                let _ = write_lyrics_to_file(&track.file_path, plain);
            }
            fetched.fetch_add(1, Ordering::Relaxed);
        }
        Err(_) => {
            if let Ok(conn) = conn_arc.lock() {
                let _ = conn.execute(
                    "UPDATE tracks SET lyrics_not_found = 1 WHERE id = ?1",
                    params![track.id],
                );
            }
            not_found_count.fetch_add(1, Ordering::Relaxed);
        }
    }
}

/// Fetch lyrics for all tracks in the library that don't have any yet.
///
/// Uses a rayon thread pool with `CONCURRENT_WORKERS` threads for parallel
/// fetching. DB lock is only held briefly for each query/update, never during
/// HTTP requests or file I/O.
pub fn fetch_library_lyrics(
    conn_arc: &Arc<Mutex<Connection>>,
    app: &tauri::AppHandle,
    cancel_flag: &Arc<AtomicBool>,
) -> LyricsFetchResult {
    // Lock briefly to query tracks and count, then release
    let (tracks, skipped_not_found) = {
        let conn = match conn_arc.lock() {
            Ok(c) => c,
            Err(_) => {
                return LyricsFetchResult {
                    total: 0,
                    fetched: 0,
                    already_had: 0,
                    not_found: 0,
                    skipped_not_found: 0,
                    cancelled: false,
                }
            }
        };

        let tracks = match conn.prepare(
            "SELECT id, title, artist, album, duration_secs, file_name, file_path
             FROM tracks
             WHERE lyrics IS NULL AND synced_lyrics IS NULL
               AND lyrics_not_found = 0
               AND artist IS NOT NULL AND artist != ''
               AND title IS NOT NULL AND title != ''",
        ) {
            Ok(mut stmt) => stmt
                .query_map(params![], |row| {
                    Ok(TrackRow {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        artist: row.get(2)?,
                        album: row.get(3)?,
                        duration_secs: row.get(4)?,
                        file_name: row.get(5)?,
                        file_path: row.get(6)?,
                    })
                })
                .ok()
                .map(|rows| rows.filter_map(|r| r.ok()).collect::<Vec<_>>())
                .unwrap_or_default(),
            Err(_) => Vec::new(),
        };

        let skipped = count_lyrics_not_found(&conn);
        (tracks, skipped)
    }; // lock released here

    let total = tracks.len();
    let completed = AtomicUsize::new(0);
    let fetched = AtomicUsize::new(0);
    let not_found_count = AtomicUsize::new(0);

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
            return LyricsFetchResult {
                total,
                fetched: 0,
                already_had: 0,
                not_found: 0,
                skipped_not_found,
                cancelled: false,
            };
        }
    };

    // Shared throttle ensures at most one request per REQUEST_THROTTLE globally
    let last_request = Mutex::new(Instant::now() - REQUEST_THROTTLE);

    pool.install(|| {
        use rayon::prelude::*;
        tracks.par_iter().for_each(|track| {
            if cancel_flag.load(Ordering::Relaxed) {
                return;
            }

            process_track(track, conn_arc, &last_request, &fetched, &not_found_count);

            let done = completed.fetch_add(1, Ordering::Relaxed) + 1;
            let display = track.title.as_deref().unwrap_or(track.file_name.as_str());
            let _ = app.emit(
                "library-lyrics-progress",
                LyricsProgress {
                    total,
                    completed: done,
                    current_track: display.to_string(),
                },
            );
        });
    });

    let was_cancelled = cancel_flag.load(Ordering::Relaxed);

    // Only emit final "done" event if not cancelled
    if !was_cancelled {
        let _ = app.emit(
            "library-lyrics-progress",
            LyricsProgress {
                total,
                completed: total,
                current_track: String::new(),
            },
        );
    }

    LyricsFetchResult {
        total,
        fetched: fetched.load(Ordering::Relaxed),
        already_had: 0,
        not_found: not_found_count.load(Ordering::Relaxed),
        skipped_not_found,
        cancelled: was_cancelled,
    }
}
