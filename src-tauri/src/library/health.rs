use rusqlite::Connection;
use serde::Serialize;

// ── Types ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct HealthReport {
    pub total_tracks: usize,
    pub issues: Vec<HealthIssue>,
}

#[derive(Debug, Clone, Serialize)]
pub struct HealthIssue {
    pub id: String,
    pub label: String,
    pub count: usize,
    pub track_ids: Vec<i64>,
}

// ── Query ───────────────────────────────────────────────────────

pub fn get_library_health(conn: &Connection) -> Result<HealthReport, String> {
    let total_tracks: usize = conn
        .query_row("SELECT COUNT(*) FROM tracks", [], |r| r.get(0))
        .map_err(|e| format!("DB error: {}", e))?;

    if total_tracks == 0 {
        return Err("No tracks in library".to_string());
    }

    let issues = vec![
        query_issue(conn, "missing_title", "Missing title", MISSING_TITLE_SQL)?,
        query_issue(conn, "missing_artist", "Missing artist", MISSING_ARTIST_SQL)?,
        query_issue(conn, "missing_album", "Missing album", MISSING_ALBUM_SQL)?,
        query_issue(conn, "missing_genre", "Missing genre", MISSING_GENRE_SQL)?,
        query_issue(conn, "missing_year", "Missing year", MISSING_YEAR_SQL)?,
        query_issue(conn, "unrated", "Unrated", UNRATED_SQL)?,
        query_issue(
            conn,
            "low_bitrate",
            "Low bitrate (< 128 kbps)",
            LOW_BITRATE_SQL,
        )?,
        query_issue(conn, "flagged", "Flagged for review", FLAGGED_SQL)?,
        query_issue(conn, "never_played", "Never played", NEVER_PLAYED_SQL)?,
    ];

    Ok(HealthReport {
        total_tracks,
        issues,
    })
}

// ── SQL constants ───────────────────────────────────────────────

const MISSING_TITLE_SQL: &str = "SELECT id FROM tracks WHERE title IS NULL OR TRIM(title) = ''";

const MISSING_ARTIST_SQL: &str = "SELECT id FROM tracks WHERE artist IS NULL OR TRIM(artist) = ''";

const MISSING_ALBUM_SQL: &str = "SELECT id FROM tracks WHERE album IS NULL OR TRIM(album) = ''";

const MISSING_GENRE_SQL: &str = "SELECT id FROM tracks WHERE genre IS NULL OR TRIM(genre) = ''";

const MISSING_YEAR_SQL: &str = "SELECT id FROM tracks WHERE year IS NULL OR year = 0";

const UNRATED_SQL: &str = "SELECT id FROM tracks WHERE rating = 0";

const LOW_BITRATE_SQL: &str =
    "SELECT id FROM tracks WHERE bitrate_kbps IS NOT NULL AND bitrate_kbps > 0 AND bitrate_kbps < 128";

const FLAGGED_SQL: &str = "SELECT id FROM tracks WHERE flagged = 1";

const NEVER_PLAYED_SQL: &str = "SELECT id FROM tracks WHERE play_count = 0";

// ── Helpers ─────────────────────────────────────────────────────

fn query_issue(conn: &Connection, id: &str, label: &str, sql: &str) -> Result<HealthIssue, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| format!("DB error: {}", e))?;

    let track_ids: Vec<i64> = stmt
        .query_map([], |r| r.get(0))
        .map_err(|e| format!("DB error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(HealthIssue {
        id: id.to_string(),
        label: label.to_string(),
        count: track_ids.len(),
        track_ids,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE tracks (
                id INTEGER PRIMARY KEY,
                file_path TEXT NOT NULL UNIQUE,
                file_name TEXT NOT NULL,
                folder_path TEXT NOT NULL,
                title TEXT,
                artist TEXT,
                album TEXT,
                album_artist TEXT,
                sort_artist TEXT,
                sort_album_artist TEXT,
                track_number INTEGER,
                track_total INTEGER,
                disc_number INTEGER,
                disc_total INTEGER,
                year INTEGER,
                genre TEXT,
                duration_secs REAL NOT NULL DEFAULT 0,
                sample_rate INTEGER,
                bitrate_kbps INTEGER,
                format TEXT NOT NULL DEFAULT '',
                file_size INTEGER NOT NULL DEFAULT 0,
                modified_at INTEGER NOT NULL DEFAULT 0,
                scanned_at INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL DEFAULT 0,
                play_count INTEGER NOT NULL DEFAULT 0,
                flagged INTEGER NOT NULL DEFAULT 0,
                rating INTEGER NOT NULL DEFAULT 0
            );",
        )
        .unwrap();
        conn
    }

    fn insert_track(
        conn: &Connection,
        id: i64,
        title: Option<&str>,
        artist: Option<&str>,
        album: Option<&str>,
        genre: Option<&str>,
        year: Option<u32>,
        bitrate: Option<u32>,
        flagged: bool,
        rating: u8,
        play_count: u32,
    ) {
        conn.execute(
            "INSERT INTO tracks (id, file_path, file_name, folder_path, title, artist, album, genre, year, bitrate_kbps, flagged, rating, play_count, format)
             VALUES (?1, ?2, ?3, '/music', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'FLAC')",
            rusqlite::params![
                id,
                format!("/music/track_{}.flac", id),
                format!("track_{}.flac", id),
                title,
                artist,
                album,
                genre,
                year,
                bitrate,
                flagged,
                rating,
                play_count
            ],
        )
        .unwrap();
    }

    #[test]
    fn empty_library_returns_error() {
        let conn = setup_db();
        let result = get_library_health(&conn);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "No tracks in library");
    }

    #[test]
    fn healthy_library_reports_zero_issues() {
        let conn = setup_db();
        insert_track(
            &conn,
            1,
            Some("Song"),
            Some("Artist"),
            Some("Album"),
            Some("Rock"),
            Some(2020),
            Some(320),
            false,
            4,
            10,
        );

        let report = get_library_health(&conn).unwrap();
        assert_eq!(report.total_tracks, 1);

        for issue in &report.issues {
            if issue.id != "never_played" && issue.id != "unrated" {
                assert_eq!(
                    issue.count, 0,
                    "Expected 0 for issue '{}', got {}",
                    issue.id, issue.count
                );
            }
        }
    }

    #[test]
    fn detects_missing_metadata() {
        let conn = setup_db();
        // Track with all metadata missing
        insert_track(&conn, 1, None, None, None, None, None, None, false, 0, 0);
        // Track with all metadata present
        insert_track(
            &conn,
            2,
            Some("Song"),
            Some("Artist"),
            Some("Album"),
            Some("Rock"),
            Some(2020),
            Some(320),
            false,
            4,
            5,
        );

        let report = get_library_health(&conn).unwrap();
        assert_eq!(report.total_tracks, 2);

        let find = |id: &str| report.issues.iter().find(|i| i.id == id).unwrap();

        assert_eq!(find("missing_title").count, 1);
        assert_eq!(find("missing_title").track_ids, vec![1]);
        assert_eq!(find("missing_artist").count, 1);
        assert_eq!(find("missing_album").count, 1);
        assert_eq!(find("missing_genre").count, 1);
        assert_eq!(find("missing_year").count, 1);
    }

    #[test]
    fn detects_low_bitrate() {
        let conn = setup_db();
        insert_track(
            &conn,
            1,
            Some("Lo-fi"),
            Some("A"),
            Some("B"),
            Some("G"),
            Some(2020),
            Some(64),
            false,
            3,
            1,
        );
        insert_track(
            &conn,
            2,
            Some("Hi-fi"),
            Some("A"),
            Some("B"),
            Some("G"),
            Some(2020),
            Some(320),
            false,
            3,
            1,
        );

        let report = get_library_health(&conn).unwrap();
        let low = report
            .issues
            .iter()
            .find(|i| i.id == "low_bitrate")
            .unwrap();
        assert_eq!(low.count, 1);
        assert_eq!(low.track_ids, vec![1]);
    }

    #[test]
    fn detects_flagged_tracks() {
        let conn = setup_db();
        insert_track(
            &conn,
            1,
            Some("S"),
            Some("A"),
            Some("B"),
            Some("G"),
            Some(2020),
            Some(320),
            true,
            3,
            1,
        );
        insert_track(
            &conn,
            2,
            Some("S"),
            Some("A"),
            Some("B"),
            Some("G"),
            Some(2020),
            Some(320),
            false,
            3,
            1,
        );

        let report = get_library_health(&conn).unwrap();
        let flagged = report.issues.iter().find(|i| i.id == "flagged").unwrap();
        assert_eq!(flagged.count, 1);
        assert_eq!(flagged.track_ids, vec![1]);
    }

    #[test]
    fn detects_never_played_and_unrated() {
        let conn = setup_db();
        insert_track(
            &conn,
            1,
            Some("S"),
            Some("A"),
            Some("B"),
            Some("G"),
            Some(2020),
            Some(320),
            false,
            0,
            0,
        );

        let report = get_library_health(&conn).unwrap();
        let unrated = report.issues.iter().find(|i| i.id == "unrated").unwrap();
        let never = report
            .issues
            .iter()
            .find(|i| i.id == "never_played")
            .unwrap();
        assert_eq!(unrated.count, 1);
        assert_eq!(never.count, 1);
    }

    #[test]
    fn returns_correct_issue_count() {
        let conn = setup_db();
        let report_issues_len = 9; // number of issue categories
        insert_track(
            &conn,
            1,
            Some("S"),
            Some("A"),
            Some("B"),
            Some("G"),
            Some(2020),
            Some(320),
            false,
            4,
            5,
        );

        let report = get_library_health(&conn).unwrap();
        assert_eq!(report.issues.len(), report_issues_len);
    }
}
