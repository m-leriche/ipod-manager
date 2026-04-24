use rusqlite::{params, Connection};

use super::now_epoch;
use super::types::LibraryFolder;

pub fn add_folder(conn: &Connection, path: &str) -> Result<(), String> {
    let now = now_epoch();
    conn.execute(
        "INSERT OR IGNORE INTO library_folders (path, added_at) VALUES (?1, ?2)",
        params![path, now],
    )
    .map_err(|e| format!("Failed to add folder: {}", e))?;
    Ok(())
}

pub fn remove_folder(conn: &Connection, path: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM tracks WHERE file_path LIKE ?1",
        params![format!("{}%", path)],
    )
    .map_err(|e| format!("Failed to remove tracks: {}", e))?;

    conn.execute("DELETE FROM library_folders WHERE path = ?1", params![path])
        .map_err(|e| format!("Failed to remove folder: {}", e))?;

    Ok(())
}

pub fn get_folders(conn: &Connection) -> Result<Vec<LibraryFolder>, String> {
    let mut stmt = conn
        .prepare("SELECT id, path, added_at FROM library_folders ORDER BY added_at")
        .map_err(|e| format!("Query failed: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(LibraryFolder {
                id: row.get(0)?,
                path: row.get(1)?,
                added_at: row.get(2)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row read failed: {}", e))
}
