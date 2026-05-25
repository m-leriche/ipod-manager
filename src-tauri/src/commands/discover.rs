use tauri::State;

use crate::discover::{self, DiscoverAlbum, DiscoverSection, SeedStrategy};
use crate::library::LibraryDb;

#[tauri::command]
pub async fn get_discover_feed(
    seed_count: Option<usize>,
    albums_per_seed: Option<usize>,
    strategy: Option<SeedStrategy>,
    db: State<'_, LibraryDb>,
) -> Result<Vec<DiscoverSection>, String> {
    let conn_arc = db.conn_arc();
    let strat = strategy.unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || {
        // Return saved snapshot if one exists (persists until explicit refresh)
        {
            let conn = conn_arc.lock().map_err(|e| format!("DB lock: {}", e))?;
            if let Some(sections) = discover::get_feed_snapshot(&conn) {
                return Ok(sections);
            }
        }
        // No snapshot — build fresh feed
        let seeds = {
            let conn = conn_arc.lock().map_err(|e| format!("DB lock: {}", e))?;
            discover::get_seed_artists(&conn, seed_count.unwrap_or(4), &strat)?
        };
        let sections =
            discover::build_discover_feed(&conn_arc, &seeds, albums_per_seed.unwrap_or(6))?;
        // Save snapshot for next load
        {
            let conn = conn_arc.lock().map_err(|e| format!("DB lock: {}", e))?;
            discover::save_feed_snapshot(&conn, &sections);
        }
        Ok(sections)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn refresh_discover_feed(
    seed_count: Option<usize>,
    albums_per_seed: Option<usize>,
    strategy: Option<SeedStrategy>,
    db: State<'_, LibraryDb>,
) -> Result<Vec<DiscoverSection>, String> {
    let conn_arc = db.conn_arc();
    let strat = strategy.unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || {
        // Clear old snapshot + per-seed cache
        {
            let conn = conn_arc.lock().map_err(|e| format!("DB lock: {}", e))?;
            discover::clear_feed_snapshot(&conn);
            discover::clear_feed_cache(&conn)?;
        }
        // Build fresh
        let seeds = {
            let conn = conn_arc.lock().map_err(|e| format!("DB lock: {}", e))?;
            discover::get_seed_artists(&conn, seed_count.unwrap_or(4), &strat)?
        };
        let sections =
            discover::build_discover_feed(&conn_arc, &seeds, albums_per_seed.unwrap_or(6))?;
        // Save new snapshot
        {
            let conn = conn_arc.lock().map_err(|e| format!("DB lock: {}", e))?;
            discover::save_feed_snapshot(&conn, &sections);
        }
        Ok(sections)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_discover_tag_albums(
    tag: String,
    limit: Option<u32>,
    db: State<'_, LibraryDb>,
) -> Result<Vec<DiscoverAlbum>, String> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc.lock().map_err(|e| format!("DB lock: {}", e))?;
        discover::get_tag_albums(&conn, &tag, limit.unwrap_or(20))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn search_discover(
    query: String,
    limit: Option<usize>,
    db: State<'_, LibraryDb>,
) -> Result<DiscoverSection, String> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        discover::search_recommendations(&conn_arc, &query, limit.unwrap_or(8))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn replace_discover_album(
    seed_artist: String,
    exclude_artists: Vec<String>,
    db: State<'_, LibraryDb>,
) -> Result<Option<DiscoverAlbum>, String> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        discover::replace_album(&conn_arc, &seed_artist, &exclude_artists)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn save_discover_snapshot(
    sections: Vec<DiscoverSection>,
    db: State<'_, LibraryDb>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
    discover::save_feed_snapshot(&conn, &sections);
    Ok(())
}

#[tauri::command]
pub async fn get_discover_enabled(db: State<'_, LibraryDb>) -> Result<bool, String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
    Ok(crate::library::get_setting(&conn, "discover_enabled")
        .map(|v| v != "false")
        .unwrap_or(true))
}

#[tauri::command]
pub async fn set_discover_enabled(enabled: bool, db: State<'_, LibraryDb>) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
    crate::library::set_setting(
        &conn,
        "discover_enabled",
        if enabled { "true" } else { "false" },
    )
}
