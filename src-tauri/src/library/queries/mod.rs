mod browser;
mod tracks;

use rusqlite::functions::FunctionFlags;
use rusqlite::Connection;

use super::types::{LibraryFilter, LibraryTrack};

pub use browser::{
    get_albums, get_albums_sorted, get_artists, get_browser_data, get_browser_data_paginated,
    get_genres, search_albums, search_artists,
};
pub use tracks::{get_track_by_id, get_tracks, get_tracks_paginated, search_tracks};

/// Generate a sort key that strips leading "The ", removes non-alphanumeric
/// characters, and lowercases — so "The Beatles" sorts under "B" and
/// punctuation like parentheses/quotes is ignored.
pub(crate) fn sort_key(s: &str) -> String {
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

/// Register sort_key() as a SQL scalar function on the given connection.
pub(crate) fn register_sort_key(conn: &Connection) -> Result<(), String> {
    conn.create_scalar_function(
        "sort_key",
        1,
        FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC,
        |ctx| {
            let raw: String = ctx.get(0)?;
            Ok(sort_key(&raw))
        },
    )
    .map_err(|e| format!("Failed to register sort_key function: {e}"))
}

/// Push an `IN (?, ?, ...)` condition for a multi-value filter.
pub(super) fn push_in_condition(
    column: &str,
    values: &[String],
    conditions: &mut Vec<String>,
    params: &mut Vec<Box<dyn rusqlite::types::ToSql>>,
) {
    if values.len() == 1 {
        conditions.push(format!("{column} = ?"));
        params.push(Box::new(values[0].clone()));
    } else {
        let placeholders: Vec<&str> = values.iter().map(|_| "?").collect();
        conditions.push(format!("{column} IN ({})", placeholders.join(", ")));
        for v in values {
            params.push(Box::new(v.clone()));
        }
    }
}

/// Build WHERE conditions from a LibraryFilter (shared by get_tracks and paginated variants).
pub(super) fn build_track_conditions(
    filter: &LibraryFilter,
) -> (String, Vec<Box<dyn rusqlite::types::ToSql>>) {
    let mut conditions = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref artists) = filter.artist {
        if !artists.is_empty() {
            push_in_condition(
                "COALESCE(album_artist, artist)",
                artists,
                &mut conditions,
                &mut params,
            );
        }
    }
    if let Some(ref albums) = filter.album {
        if !albums.is_empty() {
            push_in_condition("album", albums, &mut conditions, &mut params);
        }
    }
    if let Some(ref genres) = filter.genre {
        if !genres.is_empty() {
            push_in_condition("genre", genres, &mut conditions, &mut params);
        }
    }
    if let Some(ref search) = filter.search {
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
    if filter.flagged_only == Some(true) {
        conditions.push("flagged = 1".to_string());
    }
    if let Some(min) = filter.rating_min {
        conditions.push("rating >= ?".to_string());
        params.push(Box::new(min as i64));
    }
    if let Some(max) = filter.rating_max {
        conditions.push("rating <= ?".to_string());
        params.push(Box::new(max as i64));
    }

    let wc = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    (wc, params)
}

/// Build the ORDER BY clause from a LibraryFilter.
pub(super) fn build_order_by(filter: &LibraryFilter) -> String {
    let dir = match filter.sort_direction.as_deref() {
        Some("desc") => "DESC",
        _ => "ASC",
    };

    let sk_title = "sort_key(COALESCE(title, file_name))";
    let sk_artist = "sort_key(COALESCE(sort_artist, artist, ''))";
    let sk_album = "sort_key(COALESCE(album, ''))";
    let sk_genre = "sort_key(COALESCE(genre, ''))";
    let disc_track = "COALESCE(disc_number, 0), COALESCE(track_number, 0)";

    match filter.sort_by.as_deref() {
        Some("title") => format!("{sk_title} {dir}, {sk_artist}, {sk_album}, {disc_track}"),
        Some("artist") => format!("{sk_artist} {dir}, {sk_album}, {disc_track}"),
        Some("album") => format!("{sk_album} {dir}, {disc_track}"),
        Some("track_number") => {
            format!("COALESCE(disc_number, 0) {dir}, COALESCE(track_number, 0) {dir}")
        }
        Some("year") => format!("COALESCE(year, 0) {dir}, {sk_artist}, {sk_album}, {disc_track}"),
        Some("duration") => format!("duration_secs {dir}"),
        Some("bitrate") => format!("COALESCE(bitrate_kbps, 0) {dir}"),
        Some("genre") => format!("{sk_genre} {dir}, {sk_artist}, {sk_album}, {disc_track}"),
        Some("date_added") => format!("created_at {dir}"),
        Some("play_count") => {
            format!("play_count {dir}, {sk_artist}, {sk_album}, COALESCE(track_number, 0)")
        }
        Some("flagged") => format!("flagged {dir}, {sk_artist}, {sk_album}, {disc_track}"),
        Some("rating") => format!("rating {dir}, {sk_artist}, {sk_album}, {disc_track}"),
        _ => format!("{sk_artist} {dir}, {sk_album}, {disc_track}"),
    }
}

pub(crate) const SELECT_COLUMNS: &str =
    "id, file_path, file_name, folder_path, title, artist, album, album_artist,
     sort_artist, sort_album_artist, track_number, track_total, disc_number,
     disc_total, year, genre, duration_secs, sample_rate, bitrate_kbps, format,
     file_size, created_at, play_count, flagged, rating";

pub(crate) fn row_to_track(row: &rusqlite::Row) -> rusqlite::Result<LibraryTrack> {
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
}
