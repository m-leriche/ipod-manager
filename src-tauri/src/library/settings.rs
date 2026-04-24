use rusqlite::{params, Connection};

use super::folders::add_folder;

fn get_setting(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .ok()
}

fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| format!("Failed to save setting: {}", e))?;
    Ok(())
}

pub fn get_library_location(conn: &Connection) -> Option<String> {
    get_setting(conn, "library_location")
}

pub fn set_library_location(conn: &Connection, path: &str) -> Result<(), String> {
    set_setting(conn, "library_location", path)?;

    // The library location is the single source of truth — sync library_folders
    conn.execute("DELETE FROM tracks", [])
        .map_err(|e| format!("Failed to clear tracks: {}", e))?;
    conn.execute("DELETE FROM library_folders", [])
        .map_err(|e| format!("Failed to clear folders: {}", e))?;
    add_folder(conn, path)?;

    Ok(())
}
