use rusqlite::Connection;

use super::super::types::{
    AlbumSummary, ArtistSummary, BrowserData, GenreSummary, LibraryFilter, PaginatedBrowserData,
};
use super::genre::{aggregate_genre_counts, push_genre_match_conditions};
use super::tracks::{get_tracks, get_tracks_paginated};
use super::{push_in_condition, sort_key};

pub fn get_artists(conn: &Connection) -> Result<Vec<ArtistSummary>, String> {
    let sql = "SELECT
            COALESCE(album_artist, artist) as display_artist,
            COUNT(*) as track_count,
            COUNT(DISTINCT album) as album_count
        FROM tracks
        WHERE COALESCE(album_artist, artist) IS NOT NULL
            AND COALESCE(album_artist, artist) != ''
        GROUP BY display_artist";

    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("Query failed: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ArtistSummary {
                name: row.get(0)?,
                track_count: row.get::<_, i64>(1).map(|v| v as usize)?,
                album_count: row.get::<_, i64>(2).map(|v| v as usize)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    let mut results: Vec<_> = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row read failed: {}", e))?;
    results.sort_by_key(|a| sort_key(&a.name));
    Ok(results)
}

pub fn get_albums(conn: &Connection, artist: Option<&str>) -> Result<Vec<AlbumSummary>, String> {
    let (sql, param_values): (String, Vec<Box<dyn rusqlite::types::ToSql>>) =
        if let Some(artist) = artist {
            (
                "SELECT album, COALESCE(album_artist, artist) as display_artist,
                    MIN(year) as year, COUNT(*) as track_count,
                    MIN(folder_path) as folder_path
             FROM tracks
             WHERE album IS NOT NULL AND album != ''
                AND (album_artist = ?1 OR artist = ?1)
             GROUP BY album, display_artist"
                    .to_string(),
                vec![Box::new(artist.to_string())],
            )
        } else {
            (
                "SELECT album, COALESCE(album_artist, artist) as display_artist,
                    MIN(year) as year, COUNT(*) as track_count,
                    MIN(folder_path) as folder_path
             FROM tracks
             WHERE album IS NOT NULL AND album != ''
             GROUP BY album, display_artist"
                    .to_string(),
                vec![],
            )
        };

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Query failed: {}", e))?;
    let params_refs: Vec<&dyn rusqlite::types::ToSql> =
        param_values.iter().map(|p| p.as_ref()).collect();

    let rows = stmt
        .query_map(params_refs.as_slice(), |row| {
            Ok(AlbumSummary {
                name: row.get(0)?,
                artist: row.get(1)?,
                year: row.get(2)?,
                track_count: row.get::<_, i64>(3).map(|v| v as usize)?,
                folder_path: row.get(4)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    let mut results: Vec<_> = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row read failed: {}", e))?;

    results.sort_by_key(|a| sort_key(&a.name));
    Ok(results)
}

pub fn get_genres(conn: &Connection) -> Result<Vec<GenreSummary>, String> {
    let sql = "SELECT genre, COUNT(*) as track_count
        FROM tracks
        WHERE genre IS NOT NULL AND genre != ''
        GROUP BY genre";

    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("Query failed: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? as usize))
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    let raw: Vec<(String, usize)> = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row read failed: {}", e))?;

    let mut results = aggregate_genre_counts(raw);
    results.sort_by_key(|a| sort_key(&a.name));
    Ok(results)
}

// ── Subsonic-optimized queries ────────────────────────────────

/// Escape `%` and `_` LIKE wildcards so user input is matched literally.
fn escape_like(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

/// Return a page of albums sorted by the given Subsonic list type.
/// Pushes sorting and pagination to SQL instead of loading all albums.
pub fn get_albums_sorted(
    conn: &Connection,
    sort_type: &str,
    limit: usize,
    offset: usize,
) -> Result<Vec<AlbumSummary>, String> {
    let order_clause = match sort_type {
        // TODO: Subsonic spec defines "newest" as most-recently-added and "recent"
        // as most-recently-played. We approximate both with year DESC since we don't
        // yet track an "added to library" timestamp per album or album-level play dates.
        "newest" | "recent" => "ORDER BY year IS NULL, year DESC",
        "random" => "ORDER BY RANDOM()",
        "alphabeticalByArtist" => {
            "ORDER BY sort_key(COALESCE(album_artist, artist)), sort_key(album)"
        }
        _ => "ORDER BY sort_key(album), sort_key(COALESCE(album_artist, artist))",
    };

    let sql = format!(
        "SELECT album, COALESCE(album_artist, artist) as display_artist,
            MIN(year) as year, COUNT(*) as track_count,
            MIN(folder_path) as folder_path
         FROM tracks
         WHERE album IS NOT NULL AND album != ''
         GROUP BY album, display_artist
         {order_clause} LIMIT ?1 OFFSET ?2"
    );

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Query failed: {}", e))?;

    let rows = stmt
        .query_map(rusqlite::params![limit as i64, offset as i64], |row| {
            Ok(AlbumSummary {
                name: row.get(0)?,
                artist: row.get(1)?,
                year: row.get(2)?,
                track_count: row.get::<_, i64>(3).map(|v| v as usize)?,
                folder_path: row.get(4)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row read failed: {}", e))
}

/// Search artists by name using SQL LIKE (instead of loading all + filtering in memory).
pub fn search_artists(
    conn: &Connection,
    query: &str,
    limit: usize,
) -> Result<Vec<ArtistSummary>, String> {
    let like = format!("%{}%", escape_like(query));
    let sql = "SELECT
            COALESCE(album_artist, artist) as display_artist,
            COUNT(*) as track_count,
            COUNT(DISTINCT album) as album_count
        FROM tracks
        WHERE COALESCE(album_artist, artist) IS NOT NULL
            AND COALESCE(album_artist, artist) != ''
            AND COALESCE(album_artist, artist) LIKE ?1 ESCAPE '\\' COLLATE NOCASE
        GROUP BY display_artist
        ORDER BY sort_key(display_artist)
        LIMIT ?2";

    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("Query failed: {}", e))?;

    let rows = stmt
        .query_map(rusqlite::params![like, limit as i64], |row| {
            Ok(ArtistSummary {
                name: row.get(0)?,
                track_count: row.get::<_, i64>(1).map(|v| v as usize)?,
                album_count: row.get::<_, i64>(2).map(|v| v as usize)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row read failed: {}", e))
}

/// Search albums by name or artist using SQL LIKE (instead of loading all + filtering in memory).
pub fn search_albums(
    conn: &Connection,
    query: &str,
    limit: usize,
) -> Result<Vec<AlbumSummary>, String> {
    let like = format!("%{}%", escape_like(query));
    let sql = "SELECT album, COALESCE(album_artist, artist) as display_artist,
            MIN(year) as year, COUNT(*) as track_count,
            MIN(folder_path) as folder_path
        FROM tracks
        WHERE album IS NOT NULL AND album != ''
            AND (album LIKE ?1 ESCAPE '\\' COLLATE NOCASE
                 OR COALESCE(album_artist, artist) LIKE ?1 ESCAPE '\\' COLLATE NOCASE)
        GROUP BY album, display_artist
        ORDER BY sort_key(album)
        LIMIT ?2";

    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("Query failed: {}", e))?;

    let rows = stmt
        .query_map(rusqlite::params![like, limit as i64], |row| {
            Ok(AlbumSummary {
                name: row.get(0)?,
                artist: row.get(1)?,
                year: row.get(2)?,
                track_count: row.get::<_, i64>(3).map(|v| v as usize)?,
                folder_path: row.get(4)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row read failed: {}", e))
}

// ── Browser data (combined endpoint for column browser) ────────

/// Convert `Option<Vec<String>>` to the slice form needed by `build_filter_conditions`.
fn filter_strs(opt: &Option<Vec<String>>) -> Option<&[String]> {
    opt.as_deref().filter(|v| !v.is_empty())
}

fn build_filter_conditions(
    genre: Option<&[String]>,
    artist: Option<&[String]>,
    album: Option<&[String]>,
    search: Option<&str>,
    flagged_only: Option<bool>,
    rating_min: Option<u8>,
    rating_max: Option<u8>,
) -> (Vec<String>, Vec<Box<dyn rusqlite::types::ToSql>>) {
    let mut conditions = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(genres) = genre {
        push_genre_match_conditions(genres, &mut conditions, &mut params);
    }
    if let Some(artists) = artist {
        push_in_condition(
            "COALESCE(album_artist, artist)",
            artists,
            &mut conditions,
            &mut params,
        );
    }
    if let Some(albums) = album {
        push_in_condition("album", albums, &mut conditions, &mut params);
    }
    if let Some(search) = search {
        super::push_search_condition(search, &mut conditions, &mut params);
    }
    if flagged_only == Some(true) {
        conditions.push("flagged = 1".to_string());
    }
    if let Some(min) = rating_min {
        conditions.push("rating >= ?".to_string());
        params.push(Box::new(min as i64));
    }
    if let Some(max) = rating_max {
        conditions.push("rating <= ?".to_string());
        params.push(Box::new(max as i64));
    }

    (conditions, params)
}

fn where_clause(conditions: &[String]) -> String {
    if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    }
}

type BrowserAggregates = (Vec<GenreSummary>, Vec<ArtistSummary>, Vec<AlbumSummary>);

/// Fetch aggregate data (genres, artists, albums) for the column browser.
/// Filters cascade left to right (iTunes-style): genre narrows artists and
/// albums, artist narrows albums only. Selections never narrow columns to
/// their left, so those lists stay stable while browsing.
fn get_browser_aggregates(
    conn: &Connection,
    filter: &LibraryFilter,
) -> Result<BrowserAggregates, String> {
    let genre = filter_strs(&filter.genre);
    let artist = filter_strs(&filter.artist);
    let search = filter.search.as_deref();
    let flagged_only = filter.flagged_only;
    let rating_min = filter.rating_min;
    let rating_max = filter.rating_max;

    // Genres: filtered by search only — never by artist/album selections
    let genres = {
        let (mut conds, params) = build_filter_conditions(
            None,
            None,
            None,
            search,
            flagged_only,
            rating_min,
            rating_max,
        );
        conds.insert(0, "genre IS NOT NULL AND genre != ''".to_string());
        let wc = where_clause(&conds);
        let sql = format!(
            "SELECT genre, COUNT(*) as track_count FROM tracks {} GROUP BY genre",
            wc
        );
        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| format!("Query failed: {}", e))?;
        let refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let rows = stmt
            .query_map(refs.as_slice(), |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? as usize))
            })
            .map_err(|e| format!("Query failed: {}", e))?;
        let raw: Vec<(String, usize)> = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Row read failed: {}", e))?;
        let mut results = aggregate_genre_counts(raw);
        results.sort_by_key(|a| sort_key(&a.name));
        results
    };

    // Artists: filtered by genre + search — never by album selection
    let artists = {
        let (mut conds, params) = build_filter_conditions(
            genre,
            None,
            None,
            search,
            flagged_only,
            rating_min,
            rating_max,
        );
        conds.insert(
            0,
            "COALESCE(album_artist, artist) IS NOT NULL AND COALESCE(album_artist, artist) != ''"
                .to_string(),
        );
        let wc = where_clause(&conds);
        let sql = format!(
            "SELECT COALESCE(album_artist, artist) as display_artist, COUNT(*) as track_count, COUNT(DISTINCT album) as album_count FROM tracks {} GROUP BY display_artist",
            wc
        );
        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| format!("Query failed: {}", e))?;
        let refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let rows = stmt
            .query_map(refs.as_slice(), |row| {
                Ok(ArtistSummary {
                    name: row.get(0)?,
                    track_count: row.get::<_, i64>(1).map(|v| v as usize)?,
                    album_count: row.get::<_, i64>(2).map(|v| v as usize)?,
                })
            })
            .map_err(|e| format!("Query failed: {}", e))?;
        let mut results: Vec<_> = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Row read failed: {}", e))?;
        results.sort_by_key(|a| sort_key(&a.name));
        results
    };

    // Albums: filtered by genre + artist (NOT album) + search
    let albums = {
        let (mut conds, params) = build_filter_conditions(
            genre,
            artist,
            None,
            search,
            flagged_only,
            rating_min,
            rating_max,
        );
        conds.insert(0, "album IS NOT NULL AND album != ''".to_string());
        let wc = where_clause(&conds);
        let sql = format!(
            "SELECT album, COALESCE(album_artist, artist) as display_artist, MIN(year) as year, COUNT(*) as track_count, MIN(folder_path) as folder_path FROM tracks {} GROUP BY album, display_artist",
            wc
        );
        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| format!("Query failed: {}", e))?;
        let refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let rows = stmt
            .query_map(refs.as_slice(), |row| {
                Ok(AlbumSummary {
                    name: row.get(0)?,
                    artist: row.get(1)?,
                    year: row.get(2)?,
                    track_count: row.get::<_, i64>(3).map(|v| v as usize)?,
                    folder_path: row.get(4)?,
                })
            })
            .map_err(|e| format!("Query failed: {}", e))?;
        let mut results: Vec<_> = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Row read failed: {}", e))?;
        results.sort_by_key(|a| sort_key(&a.name));
        results
    };

    Ok((genres, artists, albums))
}

pub fn get_browser_data(conn: &Connection, filter: &LibraryFilter) -> Result<BrowserData, String> {
    let tracks = get_tracks(conn, filter)?;
    let (genres, artists, albums) = get_browser_aggregates(conn, filter)?;
    Ok(BrowserData {
        tracks,
        genres,
        artists,
        albums,
    })
}

/// Paginated variant: returns first page of tracks with total_count,
/// plus full aggregate data for genres/artists/albums.
pub fn get_browser_data_paginated(
    conn: &Connection,
    filter: &LibraryFilter,
) -> Result<PaginatedBrowserData, String> {
    let paginated_tracks = get_tracks_paginated(conn, filter)?;
    let (genres, artists, albums) = get_browser_aggregates(conn, filter)?;
    Ok(PaginatedBrowserData {
        tracks: paginated_tracks,
        genres,
        artists,
        albums,
    })
}
