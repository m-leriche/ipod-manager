use rusqlite::Connection;

use super::super::types::{LibraryFilter, LibraryTrack, PaginatedTracks};
use super::{build_order_by, build_track_conditions, row_to_track, SELECT_COLUMNS};

pub fn get_tracks(conn: &Connection, filter: &LibraryFilter) -> Result<Vec<LibraryTrack>, String> {
    let (where_clause, param_values) = build_track_conditions(filter);
    let order_by = build_order_by(filter);

    let sql = format!(
        "SELECT {} FROM tracks {} ORDER BY {}",
        SELECT_COLUMNS, where_clause, order_by
    );

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Query failed: {}", e))?;

    let params_refs: Vec<&dyn rusqlite::types::ToSql> =
        param_values.iter().map(|p| p.as_ref()).collect();

    let rows = stmt
        .query_map(params_refs.as_slice(), row_to_track)
        .map_err(|e| format!("Query failed: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row read failed: {}", e))
}

/// Return a page of tracks plus the total count matching the filter.
/// Note: OFFSET-based pagination can skip or duplicate rows if tracks are
/// added/removed between page loads. Acceptable for this use case since the
/// frontend resets pagination on any filter/sort change.
pub fn get_tracks_paginated(
    conn: &Connection,
    filter: &LibraryFilter,
) -> Result<PaginatedTracks, String> {
    let (where_clause, param_values) = build_track_conditions(filter);
    let order_by = build_order_by(filter);
    let offset = filter.offset.unwrap_or(0);
    let limit = filter.limit.unwrap_or(500);

    // Skip the COUNT query on subsequent page loads when the caller
    // already knows the total (avoids a redundant full-table scan).
    let total_count = if filter.skip_count == Some(true) {
        0
    } else {
        let count_sql = format!("SELECT COUNT(*) FROM tracks {}", where_clause);
        let count_refs: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|p| p.as_ref()).collect();
        conn.query_row(&count_sql, count_refs.as_slice(), |row| {
            row.get::<_, i64>(0).map(|v| v as usize)
        })
        .map_err(|e| format!("Count query failed: {}", e))?
    };

    // Fetch the page
    let sql = format!(
        "SELECT {} FROM tracks {} ORDER BY {} LIMIT {} OFFSET {}",
        SELECT_COLUMNS, where_clause, order_by, limit, offset
    );

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Query failed: {}", e))?;

    let params_refs: Vec<&dyn rusqlite::types::ToSql> =
        param_values.iter().map(|p| p.as_ref()).collect();

    let rows = stmt
        .query_map(params_refs.as_slice(), row_to_track)
        .map_err(|e| format!("Query failed: {}", e))?;

    let tracks = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row read failed: {}", e))?;

    Ok(PaginatedTracks {
        tracks,
        total_count,
        offset,
        limit,
    })
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
        offset: None,
        limit: None,
        skip_count: None,
    };
    get_tracks(conn, &filter)
}
