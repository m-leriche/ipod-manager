//! Derived search/sort structures for the `tracks` table: materialized
//! sort-key columns (so ORDER BY can use indexes instead of calling the
//! `sort_key()` UDF per row) and an FTS5 index for text search. Both are
//! maintained by triggers so every writer — scans, metadata saves, imports —
//! stays consistent without touching each call site.

use rusqlite::Connection;

/// SQL expressions for the sort keys, in terms of a row qualifier (`NEW`, or
/// the bare table for backfills). Must stay in step with `queries::sort_key`.
fn key_exprs(row: &str) -> [String; 4] {
    [
        format!("sort_key(COALESCE({row}.title, {row}.file_name))"),
        format!(
            "sort_key(COALESCE(NULLIF({row}.sort_album_artist,''), NULLIF({row}.album_artist,''), \
             NULLIF({row}.sort_artist,''), NULLIF({row}.artist,''), ''))"
        ),
        format!("sort_key(COALESCE({row}.album, ''))"),
        format!("sort_key(COALESCE({row}.genre, ''))"),
    ]
}

/// Columns whose changes require recomputing sort keys / FTS entries.
const SOURCE_COLUMNS: &str =
    "title, file_name, artist, album, album_artist, sort_artist, sort_album_artist, genre";

/// Create the derived columns, indexes, triggers, and FTS table, then backfill
/// any rows written before they existed. Idempotent; called from `init_db`.
pub(super) fn install(conn: &Connection) -> Result<(), String> {
    // Columns (ignore "duplicate column" on existing databases).
    for col in [
        "sort_title_key",
        "sort_artist_key",
        "sort_album_key",
        "sort_genre_key",
    ] {
        let _ = conn.execute_batch(&format!("ALTER TABLE tracks ADD COLUMN {col} TEXT"));
    }

    let [title_key, artist_key, album_key, genre_key] = key_exprs("NEW");
    let set_keys = format!(
        "UPDATE tracks SET
            sort_title_key = {title_key},
            sort_artist_key = {artist_key},
            sort_album_key = {album_key},
            sort_genre_key = {genre_key}
         WHERE id = NEW.id;"
    );

    conn.execute_batch(&format!(
        "CREATE INDEX IF NOT EXISTS idx_tracks_sort_artist_key
             ON tracks(sort_artist_key, sort_album_key);
         CREATE INDEX IF NOT EXISTS idx_tracks_sort_title_key ON tracks(sort_title_key);
         CREATE INDEX IF NOT EXISTS idx_tracks_sort_album_key ON tracks(sort_album_key);
         CREATE INDEX IF NOT EXISTS idx_tracks_sort_genre_key ON tracks(sort_genre_key);

         CREATE TRIGGER IF NOT EXISTS trg_tracks_sort_keys_insert
             AFTER INSERT ON tracks BEGIN {set_keys} END;
         CREATE TRIGGER IF NOT EXISTS trg_tracks_sort_keys_update
             AFTER UPDATE OF {SOURCE_COLUMNS} ON tracks BEGIN {set_keys} END;

         CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
             title, artist, album, album_artist, genre,
             content='tracks', content_rowid='id'
         );
         CREATE TRIGGER IF NOT EXISTS trg_tracks_fts_insert AFTER INSERT ON tracks BEGIN
             INSERT INTO tracks_fts(rowid, title, artist, album, album_artist, genre)
             VALUES (NEW.id, NEW.title, NEW.artist, NEW.album, NEW.album_artist, NEW.genre);
         END;
         CREATE TRIGGER IF NOT EXISTS trg_tracks_fts_delete AFTER DELETE ON tracks BEGIN
             INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album, album_artist, genre)
             VALUES ('delete', OLD.id, OLD.title, OLD.artist, OLD.album, OLD.album_artist, OLD.genre);
         END;
         CREATE TRIGGER IF NOT EXISTS trg_tracks_fts_update
             AFTER UPDATE OF title, artist, album, album_artist, genre ON tracks BEGIN
             INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album, album_artist, genre)
             VALUES ('delete', OLD.id, OLD.title, OLD.artist, OLD.album, OLD.album_artist, OLD.genre);
             INSERT INTO tracks_fts(rowid, title, artist, album, album_artist, genre)
             VALUES (NEW.id, NEW.title, NEW.artist, NEW.album, NEW.album_artist, NEW.genre);
         END;"
    ))
    .map_err(|e| format!("Failed to install track indexing: {e}"))?;

    backfill_if_needed(conn)
}

/// One-time backfill for rows written before the derived structures existed.
/// The NULL probe uses idx_tracks_sort_title_key, so it's O(log n) once done.
fn backfill_if_needed(conn: &Connection) -> Result<(), String> {
    let needs: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM tracks WHERE sort_title_key IS NULL)",
            [],
            |r| r.get(0),
        )
        .map_err(|e| format!("Backfill probe failed: {e}"))?;
    if !needs {
        return Ok(());
    }

    let [title_key, artist_key, album_key, genre_key] = key_exprs("tracks");
    conn.execute_batch(&format!(
        "UPDATE tracks SET
            sort_title_key = {title_key},
            sort_artist_key = {artist_key},
            sort_album_key = {album_key},
            sort_genre_key = {genre_key}
         WHERE sort_title_key IS NULL;
         INSERT INTO tracks_fts(tracks_fts) VALUES ('rebuild');"
    ))
    .map_err(|e| format!("Sort-key backfill failed: {e}"))
}

/// Build an FTS5 MATCH expression for library search: every whitespace token
/// becomes a quoted prefix phrase, AND-ed together (FTS5's implicit AND).
/// Returns an empty string for input with no tokens (caller skips the filter).
pub(crate) fn fts_match_query(input: &str) -> String {
    input
        .split_whitespace()
        .map(|t| format!("\"{}\"*", t.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::init_db;

    fn test_conn() -> (tempfile::TempDir, Connection) {
        let dir = tempfile::tempdir().unwrap();
        let conn = init_db(&dir.path().join("library.db")).unwrap();
        (dir, conn)
    }

    fn insert(conn: &Connection, title: &str, artist: &str, album: &str) -> i64 {
        conn.execute(
            "INSERT INTO tracks (file_path, file_name, folder_path, format, title, artist, album)
             VALUES (?1, ?2, '/m', 'mp3', ?3, ?4, ?5)",
            rusqlite::params![
                format!("/m/{title}.mp3"),
                format!("{title}.mp3"),
                title,
                artist,
                album
            ],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    #[test]
    fn insert_trigger_populates_sort_keys() {
        let (_dir, conn) = test_conn();
        let id = insert(&conn, "Help!", "The Beatles", "Help!");
        let (t, a): (String, String) = conn
            .query_row(
                "SELECT sort_title_key, sort_artist_key FROM tracks WHERE id = ?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(t, "help");
        assert_eq!(a, "beatles"); // "The " stripped
    }

    #[test]
    fn update_trigger_recomputes_sort_keys() {
        let (_dir, conn) = test_conn();
        let id = insert(&conn, "Song", "The Beatles", "Album");
        conn.execute("UPDATE tracks SET artist = 'ABBA' WHERE id = ?1", [id])
            .unwrap();
        let a: String = conn
            .query_row(
                "SELECT sort_artist_key FROM tracks WHERE id = ?1",
                [id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(a, "abba");
    }

    #[test]
    fn fts_search_matches_token_prefixes() {
        let (_dir, conn) = test_conn();
        insert(&conn, "Come Together", "The Beatles", "Abbey Road");
        insert(&conn, "Waterloo", "ABBA", "Waterloo");

        let count = |q: &str| -> i64 {
            conn.query_row(
                "SELECT COUNT(*) FROM tracks WHERE id IN
                 (SELECT rowid FROM tracks_fts WHERE tracks_fts MATCH ?1)",
                [fts_match_query(q)],
                |r| r.get(0),
            )
            .unwrap()
        };
        assert_eq!(count("beat"), 1); // prefix of "Beatles"
        assert_eq!(count("abbey road"), 1); // multi-token AND
        assert_eq!(count("come beatles"), 1); // tokens across columns
        assert_eq!(count("zeppelin"), 0);
    }

    #[test]
    fn fts_stays_in_sync_on_update_and_delete() {
        let (_dir, conn) = test_conn();
        let id = insert(&conn, "Song", "Old Artist", "Album");
        conn.execute(
            "UPDATE tracks SET artist = 'New Artist' WHERE id = ?1",
            [id],
        )
        .unwrap();
        let hits: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM tracks_fts WHERE tracks_fts MATCH ?1",
                [fts_match_query("new")],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(hits, 1);

        conn.execute("DELETE FROM tracks WHERE id = ?1", [id])
            .unwrap();
        let hits: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM tracks_fts WHERE tracks_fts MATCH ?1",
                [fts_match_query("new")],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(hits, 0);
    }

    #[test]
    fn backfill_repairs_null_keys_and_fts() {
        let (_dir, conn) = test_conn();
        insert(&conn, "Song", "Artist", "Album");
        // Simulate a pre-migration row: null out the derived keys.
        conn.execute_batch(
            "UPDATE tracks SET sort_title_key = NULL, sort_artist_key = NULL,
             sort_album_key = NULL, sort_genre_key = NULL;",
        )
        .unwrap();

        backfill_if_needed(&conn).unwrap();
        let t: String = conn
            .query_row("SELECT sort_title_key FROM tracks", [], |r| r.get(0))
            .unwrap();
        assert_eq!(t, "song");
    }

    #[test]
    fn fts_match_query_quotes_and_prefixes() {
        assert_eq!(fts_match_query("abbey road"), "\"abbey\"* \"road\"*");
        assert_eq!(fts_match_query("  "), "");
        // Embedded quotes are doubled, not left to break the query.
        assert_eq!(fts_match_query("say \"hi\""), "\"say\"* \"\"\"hi\"\"\"*");
    }

    #[test]
    fn default_sort_order_by_uses_index_not_temp_btree() {
        let (_dir, conn) = test_conn();
        insert(&conn, "Song", "Artist", "Album");
        let plan: String = conn
            .query_row(
                "EXPLAIN QUERY PLAN SELECT id FROM tracks
                 ORDER BY sort_artist_key, sort_album_key",
                [],
                |r| r.get(3),
            )
            .unwrap();
        assert!(
            plan.contains("idx_tracks_sort_artist_key"),
            "expected index scan, got: {plan}"
        );
    }
}
