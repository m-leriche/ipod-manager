use tauri::{AppHandle, State};

use crate::artist_releases::db;
use crate::artist_releases::types::{
    DiscoveredRelease, MatchStatus, NewReleasesCheckResult, WatchedArtist,
};
use crate::files::NewReleasesCancel;
use crate::library::LibraryDb;
use crate::musicbrainz::MbArtistSearchResult;

#[tauri::command]
pub async fn get_watched_artists(db: State<'_, LibraryDb>) -> Result<Vec<WatchedArtist>, String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
    db::get_watched_artists(&conn)
}

#[tauri::command]
pub async fn watch_artist(name: String, db: State<'_, LibraryDb>) -> Result<WatchedArtist, String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
    db::add_watched_artist(&conn, &name)
}

#[tauri::command]
pub async fn unwatch_artist(id: i64, db: State<'_, LibraryDb>) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
    db::remove_watched_artist(&conn, id)
}

#[tauri::command]
pub async fn is_artist_watched(name: String, db: State<'_, LibraryDb>) -> Result<bool, String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
    Ok(db::is_artist_watched(&conn, &name))
}

#[tauri::command]
pub async fn check_new_releases(
    app: AppHandle,
    db: State<'_, LibraryDb>,
    cancel: State<'_, NewReleasesCancel>,
) -> Result<NewReleasesCheckResult, String> {
    let conn_arc = db.conn_arc();
    let flag = cancel.new_flag();

    tauri::async_runtime::spawn_blocking(move || {
        crate::artist_releases::check_new_releases(&conn_arc, &app, &flag)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn cancel_new_releases_check(cancel: State<'_, NewReleasesCancel>) -> Result<(), String> {
    cancel.cancel();
    Ok(())
}

#[tauri::command]
pub async fn get_discovered_releases(
    include_dismissed: bool,
    db: State<'_, LibraryDb>,
) -> Result<Vec<DiscoveredRelease>, String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
    db::get_discovered_releases(&conn, include_dismissed)
}

#[tauri::command]
pub async fn dismiss_release(id: i64, db: State<'_, LibraryDb>) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
    db::dismiss_release(&conn, id)
}

#[tauri::command]
pub async fn search_artist_mbid(name: String) -> Result<Vec<MbArtistSearchResult>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::artist_releases::lookup::search_artist_candidates(&name)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn set_watched_artist_mbid(
    id: i64,
    mbid: String,
    mb_name: String,
    db: State<'_, LibraryDb>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
    db::set_artist_mbid(&conn, id, &mbid, &mb_name, MatchStatus::Manual)
}

#[tauri::command]
pub async fn get_artists_with_new_releases(
    db: State<'_, LibraryDb>,
) -> Result<Vec<String>, String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
    db::get_new_release_artist_names(&conn)
}

#[tauri::command]
pub async fn get_last_releases_check(db: State<'_, LibraryDb>) -> Result<Option<String>, String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
    Ok(crate::library::get_setting(&conn, "last_releases_check"))
}

#[tauri::command]
pub async fn clear_discovered_releases(db: State<'_, LibraryDb>) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
    db::clear_discovered_releases(&conn)
}
