use rusqlite::Connection;

use super::types::{
    AlbumSummary, ArtistSummary, BrowserData, GenreSummary, LibraryFilter, LibraryTrack,
};

/// Generate a sort key that strips leading "The ", removes non-alphanumeric
/// characters, and lowercases — so "The Beatles" sorts under "B" and
/// punctuation like parentheses/quotes is ignored.
fn sort_key(s: &str) -> String {
    let trimmed = s.trim();
    let without_the = trimmed
        .strip_prefix("The ")
        .or_else(|| trimmed.strip_prefix("the "))
        .or_else(|| trimmed.strip_prefix("THE "))
        .unwrap_or(trimmed);
    without_the
        .chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

pub fn get_tracks(conn: &Connection, filter: &LibraryFilter) -> Result<Vec<LibraryTrack>, String> {
    let mut conditions = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref artist) = filter.artist {
        conditions.push("COALESCE(album_artist, artist) = ?");
        param_values.push(Box::new(artist.clone()));
    }
    if let Some(ref album) = filter.album {
        conditions.push("album = ?");
        param_values.push(Box::new(album.clone()));
    }
    if let Some(ref genre) = filter.genre {
        conditions.push("genre = ?");
        param_values.push(Box::new(genre.clone()));
    }
    if let Some(ref search) = filter.search {
        if !search.is_empty() {
            conditions.push(
                "(title LIKE ? OR artist LIKE ? OR album LIKE ? OR album_artist LIKE ? OR genre LIKE ?)",
            );
            let like = format!("%{}%", search);
            for _ in 0..5 {
                param_values.push(Box::new(like.clone()));
            }
        }
    }
    if filter.flagged_only == Some(true) {
        conditions.push("flagged = 1");
    }
    if let Some(min) = filter.rating_min {
        conditions.push("rating >= ?");
        param_values.push(Box::new(min as i64));
    }
    if let Some(max) = filter.rating_max {
        conditions.push("rating <= ?");
        param_values.push(Box::new(max as i64));
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let dir = match filter.sort_direction.as_deref() {
        Some("desc") => "DESC",
        _ => "ASC",
    };

    let order_by = match filter.sort_by.as_deref() {
        Some("title") => format!(
            "COALESCE(title, file_name) COLLATE NOCASE {dir}, COALESCE(sort_artist, artist, '') COLLATE NOCASE, COALESCE(album, '') COLLATE NOCASE, COALESCE(disc_number, 0), COALESCE(track_number, 0)"
        ),
        Some("artist") => format!(
            "COALESCE(sort_artist, artist, '') COLLATE NOCASE {dir}, COALESCE(album, '') COLLATE NOCASE, COALESCE(disc_number, 0), COALESCE(track_number, 0)"
        ),
        Some("album") => format!(
            "COALESCE(album, '') COLLATE NOCASE {dir}, COALESCE(disc_number, 0), COALESCE(track_number, 0)"
        ),
        Some("track_number") => format!(
            "COALESCE(disc_number, 0) {dir}, COALESCE(track_number, 0) {dir}"
        ),
        Some("year") => format!(
            "COALESCE(year, 0) {dir}, COALESCE(sort_artist, artist, '') COLLATE NOCASE, COALESCE(album, '') COLLATE NOCASE, COALESCE(disc_number, 0), COALESCE(track_number, 0)"
        ),
        Some("duration") => format!("duration_secs {dir}"),
        Some("bitrate") => format!("COALESCE(bitrate_kbps, 0) {dir}"),
        Some("genre") => format!(
            "COALESCE(genre, '') COLLATE NOCASE {dir}, COALESCE(sort_artist, artist, '') COLLATE NOCASE, COALESCE(album, '') COLLATE NOCASE, COALESCE(disc_number, 0), COALESCE(track_number, 0)"
        ),
        Some("date_added") => format!("created_at {dir}"),
        Some("play_count") => format!(
            "play_count {dir}, COALESCE(sort_artist, artist, '') COLLATE NOCASE, COALESCE(album, '') COLLATE NOCASE, COALESCE(track_number, 0)"
        ),
        Some("flagged") => format!(
            "flagged {dir}, COALESCE(sort_artist, artist, '') COLLATE NOCASE, COALESCE(album, '') COLLATE NOCASE, COALESCE(disc_number, 0), COALESCE(track_number, 0)"
        ),
        Some("rating") => format!(
            "rating {dir}, COALESCE(sort_artist, artist, '') COLLATE NOCASE, COALESCE(album, '') COLLATE NOCASE, COALESCE(disc_number, 0), COALESCE(track_number, 0)"
        ),
        _ => format!(
            "COALESCE(sort_artist, artist, '') COLLATE NOCASE {dir}, COALESCE(album, '') COLLATE NOCASE, COALESCE(disc_number, 0), COALESCE(track_number, 0)"
        ),
    };

    let sql = format!(
        "SELECT id, file_path, file_name, folder_path, title, artist, album, album_artist,
                sort_artist, sort_album_artist, track_number, track_total, disc_number,
                disc_total, year, genre, duration_secs, sample_rate, bitrate_kbps, format,
                file_size, created_at, play_count, flagged, rating
         FROM tracks {} ORDER BY {}",
        where_clause, order_by
    );

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Query failed: {}", e))?;

    let params_refs: Vec<&dyn rusqlite::types::ToSql> =
        param_values.iter().map(|p| p.as_ref()).collect();

    let rows = stmt
        .query_map(params_refs.as_slice(), |row| {
            Ok(LibraryTrack {
                id: row.get(0)?,
                file_path: row.get(1)?,
                file_name: row.get(2)?,
                folder_path: row.get(3)?,
                title: row.get(4)?,
                artist: row.get(5)?,
                album: row.get(6)?,
                album_artist: row.get(7)?,
                sort_artist: row.get(8)?,
                sort_album_artist: row.get(9)?,
                track_number: row.get(10)?,
                track_total: row.get(11)?,
                disc_number: row.get(12)?,
                disc_total: row.get(13)?,
                year: row.get(14)?,
                genre: row.get(15)?,
                duration_secs: row.get(16)?,
                sample_rate: row.get(17)?,
                bitrate_kbps: row.get(18)?,
                format: row.get(19)?,
                file_size: row.get::<_, i64>(20).map(|v| v as u64)?,
                created_at: row.get(21)?,
                play_count: row.get::<_, i64>(22).map(|v| v as u32)?,
                flagged: row.get(23)?,
                rating: row.get::<_, i64>(24).map(|v| v as u8)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row read failed: {}", e))
}

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
            Ok(GenreSummary {
                name: row.get(0)?,
                track_count: row.get::<_, i64>(1).map(|v| v as usize)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    let mut results: Vec<_> = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row read failed: {}", e))?;
    results.sort_by_key(|a| sort_key(&a.name));
    Ok(results)
}

pub fn search_tracks(conn: &Connection, query: &str) -> Result<Vec<LibraryTrack>, String> {
    let filter = LibraryFilter {
        artist: None,
        album: None,
        genre: None,
        search: Some(query.to_string()),
        sort_by: None,
        sort_direction: None,
        flagged_only: None,
        rating_min: None,
        rating_max: None,
    };
    get_tracks(conn, &filter)
}

// ── Browser data (combined endpoint for column browser) ────────

fn build_filter_conditions(
    genre: Option<&str>,
    artist: Option<&str>,
    album: Option<&str>,
    search: Option<&str>,
    flagged_only: Option<bool>,
    rating_min: Option<u8>,
    rating_max: Option<u8>,
) -> (Vec<String>, Vec<Box<dyn rusqlite::types::ToSql>>) {
    let mut conditions = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(genre) = genre {
        conditions.push("genre = ?".to_string());
        params.push(Box::new(genre.to_string()));
    }
    if let Some(artist) = artist {
        conditions.push("COALESCE(album_artist, artist) = ?".to_string());
        params.push(Box::new(artist.to_string()));
    }
    if let Some(album) = album {
        conditions.push("album = ?".to_string());
        params.push(Box::new(album.to_string()));
    }
    if let Some(search) = search {
        if !search.is_empty() {
            conditions.push(
                "(title LIKE ? OR artist LIKE ? OR album LIKE ? OR album_artist LIKE ? OR genre LIKE ?)".to_string(),
            );
            let like = format!("%{}%", search);
            for _ in 0..5 {
                params.push(Box::new(like.clone()));
            }
        }
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

pub fn get_browser_data(conn: &Connection, filter: &LibraryFilter) -> Result<BrowserData, String> {
    let genre = filter.genre.as_deref();
    let artist = filter.artist.as_deref();
    let album = filter.album.as_deref();
    let search = filter.search.as_deref();
    let flagged_only = filter.flagged_only;
    let rating_min = filter.rating_min;
    let rating_max = filter.rating_max;

    let tracks = get_tracks(conn, filter)?;

    // Genres: filtered by artist + album (NOT genre) + search
    let genres = {
        let (mut conds, params) = build_filter_conditions(
            None,
            artist,
            album,
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
                Ok(GenreSummary {
                    name: row.get(0)?,
                    track_count: row.get::<_, i64>(1).map(|v| v as usize)?,
                })
            })
            .map_err(|e| format!("Query failed: {}", e))?;
        let mut results: Vec<_> = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Row read failed: {}", e))?;
        results.sort_by_key(|a| sort_key(&a.name));
        results
    };

    // Artists: filtered by genre + album (NOT artist) + search
    let artists = {
        let (mut conds, params) = build_filter_conditions(
            genre,
            None,
            album,
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

    Ok(BrowserData {
        tracks,
        genres,
        artists,
        albums,
    })
}
