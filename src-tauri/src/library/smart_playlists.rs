use rusqlite::Connection;
use std::time::{SystemTime, UNIX_EPOCH};

use super::now_epoch;
use super::types::{LibraryTrack, SmartPlaylist, SmartPlaylistRuleGroup};

// ── Rule engine: convert rules to parameterized SQL ──────────

fn rule_to_sql(
    rule: &super::types::SmartPlaylistRule,
    params: &mut Vec<Box<dyn rusqlite::types::ToSql>>,
) -> Result<String, String> {
    let col = field_to_column(&rule.field)?;
    let field_type = field_type(&rule.field);

    match rule.operator.as_str() {
        "equals" => {
            params.push(box_val(&rule.value, field_type));
            Ok(format!("{} = ? COLLATE NOCASE", col))
        }
        "not_equals" => {
            params.push(box_val(&rule.value, field_type));
            Ok(format!("{} != ? COLLATE NOCASE", col))
        }
        "contains" => {
            params.push(Box::new(format!("%{}%", rule.value)));
            Ok(format!("{} LIKE ? COLLATE NOCASE", col))
        }
        "not_contains" => {
            params.push(Box::new(format!("%{}%", rule.value)));
            Ok(format!("{} NOT LIKE ? COLLATE NOCASE", col))
        }
        "greater_than" => {
            params.push(box_val(&rule.value, field_type));
            Ok(format!("{} > ?", col))
        }
        "less_than" => {
            params.push(box_val(&rule.value, field_type));
            Ok(format!("{} < ?", col))
        }
        "between" => {
            let v2 = rule
                .value2
                .as_deref()
                .ok_or("'between' operator requires value2")?;
            params.push(box_val(&rule.value, field_type));
            params.push(box_val(v2, field_type));
            Ok(format!("{} BETWEEN ? AND ?", col))
        }
        "is_true" => Ok(format!("{} = 1", col)),
        "is_false" => Ok(format!("{} = 0", col)),
        "in_last_days" => {
            let days: i64 = rule
                .value
                .parse()
                .map_err(|_| "in_last_days requires a numeric value")?;
            let cutoff = now_secs() - (days * 86400);
            params.push(Box::new(cutoff));
            Ok(format!("{} >= ?", col))
        }
        op => Err(format!("Unknown operator: {}", op)),
    }
}

pub fn rules_to_where(
    group: &SmartPlaylistRuleGroup,
) -> Result<(String, Vec<Box<dyn rusqlite::types::ToSql>>), String> {
    if group.rules.is_empty() {
        return Ok((String::new(), Vec::new()));
    }

    let joiner = match group.match_type.as_str() {
        "any" => " OR ",
        _ => " AND ",
    };

    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut clauses = Vec::new();

    for rule in &group.rules {
        clauses.push(rule_to_sql(rule, &mut params)?);
    }

    let where_str = format!("WHERE {}", clauses.join(joiner));
    Ok((where_str, params))
}

fn field_to_column(field: &str) -> Result<&'static str, String> {
    match field {
        "title" => Ok("title"),
        "artist" => Ok("COALESCE(album_artist, artist)"),
        "album" => Ok("album"),
        "album_artist" => Ok("album_artist"),
        "genre" => Ok("genre"),
        "year" => Ok("COALESCE(year, 0)"),
        "rating" => Ok("rating"),
        "play_count" => Ok("play_count"),
        "duration_secs" => Ok("duration_secs"),
        "bitrate_kbps" => Ok("COALESCE(bitrate_kbps, 0)"),
        "format" => Ok("format"),
        "file_size" => Ok("file_size"),
        "created_at" => Ok("created_at"),
        "flagged" => Ok("flagged"),
        f => Err(format!("Unknown field: {}", f)),
    }
}

#[derive(Clone, Copy)]
enum FieldType {
    Text,
    Number,
    Float,
}

fn field_type(field: &str) -> FieldType {
    match field {
        "title" | "artist" | "album" | "album_artist" | "genre" | "format" => FieldType::Text,
        "duration_secs" => FieldType::Float,
        _ => FieldType::Number,
    }
}

fn box_val(v: &str, ft: FieldType) -> Box<dyn rusqlite::types::ToSql> {
    match ft {
        FieldType::Text => Box::new(v.to_string()),
        FieldType::Number => Box::new(v.parse::<i64>().unwrap_or(0)),
        FieldType::Float => Box::new(v.parse::<f64>().unwrap_or(0.0)),
    }
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

// ── CRUD operations ──────────────────────────────────────────

pub fn get_smart_playlists(conn: &Connection) -> Result<Vec<SmartPlaylist>, String> {
    let sql = "SELECT id, name, icon, rules_json, sort_by, sort_direction, track_limit, is_builtin, created_at, updated_at
               FROM smart_playlists
               ORDER BY is_builtin DESC, name COLLATE NOCASE";

    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("Query failed: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            let rules_json: String = row.get(3)?;
            let rules: SmartPlaylistRuleGroup =
                serde_json::from_str(&rules_json).unwrap_or(SmartPlaylistRuleGroup {
                    match_type: "all".to_string(),
                    rules: Vec::new(),
                });
            Ok(SmartPlaylist {
                id: row.get(0)?,
                name: row.get(1)?,
                icon: row.get(2)?,
                rules,
                sort_by: row.get(4)?,
                sort_direction: row.get(5)?,
                track_limit: row.get::<_, Option<i64>>(6)?.map(|v| v as u32),
                is_builtin: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row read failed: {}", e))
}

pub fn create_smart_playlist(
    conn: &Connection,
    name: &str,
    rules: &SmartPlaylistRuleGroup,
    sort_by: Option<&str>,
    sort_direction: Option<&str>,
    track_limit: Option<u32>,
) -> Result<SmartPlaylist, String> {
    let rules_json =
        serde_json::to_string(rules).map_err(|e| format!("Failed to serialize rules: {}", e))?;
    let now = now_epoch();

    conn.execute(
        "INSERT INTO smart_playlists (name, rules_json, sort_by, sort_direction, track_limit, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![name, rules_json, sort_by, sort_direction, track_limit.map(|v| v as i64), now, now],
    )
    .map_err(|e| format!("Failed to create smart playlist: {}", e))?;

    let id = conn.last_insert_rowid();
    Ok(SmartPlaylist {
        id,
        name: name.to_string(),
        icon: None,
        rules: rules.clone(),
        sort_by: sort_by.map(|s| s.to_string()),
        sort_direction: sort_direction.map(|s| s.to_string()),
        track_limit,
        is_builtin: false,
        created_at: now,
        updated_at: now,
    })
}

pub fn update_smart_playlist(
    conn: &Connection,
    id: i64,
    name: &str,
    rules: &SmartPlaylistRuleGroup,
    sort_by: Option<&str>,
    sort_direction: Option<&str>,
    track_limit: Option<u32>,
) -> Result<(), String> {
    // Don't allow editing built-in smart playlists
    let is_builtin: bool = conn
        .query_row(
            "SELECT is_builtin FROM smart_playlists WHERE id = ?1",
            rusqlite::params![id],
            |row| row.get(0),
        )
        .map_err(|_| "Smart playlist not found".to_string())?;

    if is_builtin {
        return Err("Cannot edit built-in smart playlists".into());
    }

    let rules_json =
        serde_json::to_string(rules).map_err(|e| format!("Failed to serialize rules: {}", e))?;
    let now = now_epoch();

    let changed = conn
        .execute(
            "UPDATE smart_playlists SET name = ?1, rules_json = ?2, sort_by = ?3, sort_direction = ?4, track_limit = ?5, updated_at = ?6 WHERE id = ?7",
            rusqlite::params![name, rules_json, sort_by, sort_direction, track_limit.map(|v| v as i64), now, id],
        )
        .map_err(|e| format!("Failed to update smart playlist: {}", e))?;

    if changed == 0 {
        return Err("Smart playlist not found".into());
    }
    Ok(())
}

pub fn delete_smart_playlist(conn: &Connection, id: i64) -> Result<(), String> {
    let is_builtin: bool = conn
        .query_row(
            "SELECT is_builtin FROM smart_playlists WHERE id = ?1",
            rusqlite::params![id],
            |row| row.get(0),
        )
        .map_err(|_| "Smart playlist not found".to_string())?;

    if is_builtin {
        return Err("Cannot delete built-in smart playlists".into());
    }

    conn.execute(
        "DELETE FROM smart_playlists WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| format!("Failed to delete smart playlist: {}", e))?;
    Ok(())
}

pub fn get_smart_playlist_tracks(conn: &Connection, id: i64) -> Result<Vec<LibraryTrack>, String> {
    // Load the smart playlist definition
    let (rules_json, sort_by, sort_direction, track_limit): (
        String,
        Option<String>,
        Option<String>,
        Option<i64>,
    ) = conn
        .query_row(
            "SELECT rules_json, sort_by, sort_direction, track_limit FROM smart_playlists WHERE id = ?1",
            rusqlite::params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|_| "Smart playlist not found".to_string())?;

    let rules: SmartPlaylistRuleGroup =
        serde_json::from_str(&rules_json).map_err(|e| format!("Invalid rules JSON: {}", e))?;

    let (where_clause, params) = rules_to_where(&rules)?;

    let dir = match sort_direction.as_deref() {
        Some("asc") => "ASC",
        _ => "DESC",
    };

    let order_by = match sort_by.as_deref() {
        Some("title") => format!("COALESCE(title, file_name) COLLATE NOCASE {dir}"),
        Some("artist") => format!("COALESCE(sort_artist, artist, '') COLLATE NOCASE {dir}"),
        Some("album") => format!("COALESCE(album, '') COLLATE NOCASE {dir}"),
        Some("year") => format!("COALESCE(year, 0) {dir}"),
        Some("rating") => format!("rating {dir}"),
        Some("play_count") => format!("play_count {dir}"),
        Some("duration") => format!("duration_secs {dir}"),
        Some("bitrate") => format!("COALESCE(bitrate_kbps, 0) {dir}"),
        Some("date_added") | Some("created_at") => format!("created_at {dir}"),
        _ => format!(
            "COALESCE(sort_artist, artist, '') COLLATE NOCASE {dir}, COALESCE(album, '') COLLATE NOCASE, COALESCE(disc_number, 0), COALESCE(track_number, 0)"
        ),
    };

    let limit_clause = match track_limit {
        Some(n) if n > 0 => format!(" LIMIT {}", n),
        _ => String::new(),
    };

    let sql = format!(
        "SELECT id, file_path, file_name, folder_path, title, artist, album, album_artist,
                sort_artist, sort_album_artist, track_number, track_total, disc_number,
                disc_total, year, genre, duration_secs, sample_rate, bitrate_kbps, format,
                file_size, created_at, play_count, flagged, rating
         FROM tracks {} ORDER BY {}{}",
        where_clause, order_by, limit_clause
    );

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Query failed: {}", e))?;

    let params_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

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
