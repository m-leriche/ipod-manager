//! Multi-genre support: a track's `genre` column may hold several genres
//! joined as "A; B; C". These helpers split, match, and aggregate them so
//! each genre behaves as its own entry in the browser and filters.

use std::collections::HashMap;

use super::super::types::GenreSummary;

/// Split a stored genre string on ';', trimming whitespace around each part.
pub(crate) fn split_genres(raw: &str) -> impl Iterator<Item = &str> {
    raw.split(';').map(str::trim).filter(|s| !s.is_empty())
}

/// SQL expression matching a single genre inside a "; "-joined genre value.
/// The value is normalized to ';'-separated and wrapped in ';' sentinels so
/// `instr` only matches whole entries ("Pop" matches "Rock; Pop" but not
/// "Pop Rock"). Exact-case, like the `genre = ?` condition it replaces.
const GENRE_MATCH: &str =
    "instr(';' || REPLACE(COALESCE(genre, ''), '; ', ';') || ';', ';' || ? || ';') > 0";

/// Case-insensitive variant for smart playlist rules, matching the
/// `COLLATE NOCASE` semantics of the other text operators.
pub(crate) const GENRE_MATCH_NOCASE: &str =
    "instr(lower(';' || REPLACE(COALESCE(genre, ''), '; ', ';') || ';'), lower(';' || ? || ';')) > 0";

/// Push an OR-joined whole-genre match for a multi-value genre filter.
/// A track matches when any of its genres equals any selected value.
pub(crate) fn push_genre_match_conditions(
    values: &[String],
    conditions: &mut Vec<String>,
    params: &mut Vec<Box<dyn rusqlite::types::ToSql>>,
) {
    let ors: Vec<&str> = values.iter().map(|_| GENRE_MATCH).collect();
    conditions.push(format!("({})", ors.join(" OR ")));
    for v in values {
        params.push(Box::new(v.trim().to_string()));
    }
}

/// Aggregate raw (genre_string, count) rows into per-genre totals, splitting
/// joined values. A track tagged "Rock; Pop" counts once under each genre,
/// so genre totals can sum to more than the track count (as in iTunes).
pub(crate) fn aggregate_genre_counts(rows: Vec<(String, usize)>) -> Vec<GenreSummary> {
    let mut counts: HashMap<String, usize> = HashMap::new();
    for (raw, count) in rows {
        for g in split_genres(&raw) {
            *counts.entry(g.to_string()).or_insert(0) += count;
        }
    }
    counts
        .into_iter()
        .map(|(name, track_count)| GenreSummary { name, track_count })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn split_handles_single_and_joined_values() {
        let split = |s: &str| split_genres(s).map(str::to_string).collect::<Vec<_>>();
        assert_eq!(split("Rock"), vec!["Rock"]);
        assert_eq!(split("Rock; Pop"), vec!["Rock", "Pop"]);
        assert_eq!(split("Rock;Pop"), vec!["Rock", "Pop"]);
        assert_eq!(split(" Rock ; "), vec!["Rock"]);
        assert!(split("").is_empty());
    }

    #[test]
    fn aggregate_sums_counts_across_rows() {
        let rows = vec![
            ("Rock; Pop".to_string(), 10),
            ("Rock".to_string(), 5),
            ("Pop; Rock".to_string(), 2),
        ];
        let mut result = aggregate_genre_counts(rows);
        result.sort_by(|a, b| a.name.cmp(&b.name));
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].name, "Pop");
        assert_eq!(result[0].track_count, 12);
        assert_eq!(result[1].name, "Rock");
        assert_eq!(result[1].track_count, 17);
    }

    fn db_with_genres(genres: &[Option<&str>]) -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE tracks (genre TEXT)", [])
            .unwrap();
        for g in genres {
            conn.execute("INSERT INTO tracks (genre) VALUES (?)", [g])
                .unwrap();
        }
        conn
    }

    fn count_matching(conn: &Connection, values: &[&str]) -> usize {
        let mut conditions = Vec::new();
        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        let vals: Vec<String> = values.iter().map(|s| s.to_string()).collect();
        push_genre_match_conditions(&vals, &mut conditions, &mut params);
        let sql = format!("SELECT COUNT(*) FROM tracks WHERE {}", conditions[0]);
        let refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let count: i64 = conn.query_row(&sql, refs.as_slice(), |r| r.get(0)).unwrap();
        count as usize
    }

    #[test]
    fn match_finds_genre_inside_joined_value() {
        let conn = db_with_genres(&[
            Some("Rock; Pop"),
            Some("Rock;Pop"),
            Some("Pop Rock"),
            Some("Rock"),
            Some(""),
            None,
        ]);
        assert_eq!(count_matching(&conn, &["Pop"]), 2);
        assert_eq!(count_matching(&conn, &["Rock"]), 3);
        assert_eq!(count_matching(&conn, &["Pop Rock"]), 1);
        assert_eq!(count_matching(&conn, &["Jazz"]), 0);
    }

    #[test]
    fn match_is_or_across_multiple_values() {
        let conn = db_with_genres(&[Some("Rock"), Some("Jazz"), Some("Pop")]);
        assert_eq!(count_matching(&conn, &["Rock", "Jazz"]), 2);
    }

    #[test]
    fn match_is_exact_case_like_the_in_condition_it_replaces() {
        let conn = db_with_genres(&[Some("Rock")]);
        assert_eq!(count_matching(&conn, &["rock"]), 0);
    }

    #[test]
    fn nocase_match_is_case_insensitive() {
        let conn = db_with_genres(&[Some("Rock; Pop"), Some("Pop Rock"), None]);
        let sql = format!("SELECT COUNT(*) FROM tracks WHERE {}", GENRE_MATCH_NOCASE);
        let count: i64 = conn.query_row(&sql, ["pop"], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);
    }
}
