use crate::error::AppError;
use crate::lastfm::{self, ScrobbleEntry};
use crate::library::LibraryDb;
use crate::{lastfm_queue, library};
use serde::Serialize;
use tauri::State;

#[derive(Serialize)]
pub struct TokenResponse {
    token: String,
    auth_url: String,
}

#[derive(Serialize)]
pub struct LastfmStatus {
    connected: bool,
    username: Option<String>,
    scrobble_enabled: bool,
    queue_count: usize,
}

#[tauri::command]
pub async fn lastfm_get_token() -> Result<TokenResponse, AppError> {
    tauri::async_runtime::spawn_blocking(|| {
        let token = lastfm::get_token()?;
        let auth_url = lastfm::auth_url(&token);
        Ok::<_, String>(TokenResponse { token, auth_url })
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn lastfm_get_session(
    token: String,
    db: State<'_, LibraryDb>,
) -> Result<String, AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let session = lastfm::get_session(&token)?;
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::set_setting(&conn, "lastfm_session_key", &session.session_key)?;
        library::set_setting(&conn, "lastfm_username", &session.username)?;
        library::set_setting(&conn, "lastfm_scrobble_enabled", "true")?;
        Ok::<_, String>(session.username)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn lastfm_disconnect(db: State<'_, LibraryDb>) -> Result<(), AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::delete_setting(&conn, "lastfm_session_key")?;
        library::delete_setting(&conn, "lastfm_username")?;
        library::delete_setting(&conn, "lastfm_scrobble_enabled")?;
        Ok::<_, String>(())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn lastfm_get_status(db: State<'_, LibraryDb>) -> Result<LastfmStatus, AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        let session_key = library::get_setting(&conn, "lastfm_session_key");
        let username = library::get_setting(&conn, "lastfm_username");
        let scrobble_enabled = library::get_setting(&conn, "lastfm_scrobble_enabled")
            .map(|v| v == "true")
            .unwrap_or(true);
        let count = lastfm_queue::queue_count(&conn).unwrap_or(0);

        Ok::<_, String>(LastfmStatus {
            connected: session_key.is_some(),
            username,
            scrobble_enabled,
            queue_count: count,
        })
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn lastfm_update_now_playing(
    artist: String,
    track: String,
    album: Option<String>,
    album_artist: Option<String>,
    duration_secs: Option<u32>,
    db: State<'_, LibraryDb>,
) -> Result<(), AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let session_key = {
            let conn = conn_arc
                .lock()
                .map_err(|e| format!("DB lock failed: {}", e))?;
            library::get_setting(&conn, "lastfm_session_key")
                .ok_or_else(|| "Not connected to Last.fm".to_string())?
        };
        // Fire-and-forget: log errors but don't propagate
        if let Err(e) = lastfm::update_now_playing(
            &session_key,
            &artist,
            &track,
            album.as_deref(),
            album_artist.as_deref(),
            duration_secs,
        ) {
            log::warn!("Last.fm now playing update failed: {}", e);
        }
        Ok::<_, String>(())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn lastfm_scrobble(
    artist: String,
    track: String,
    album: Option<String>,
    album_artist: Option<String>,
    duration_secs: u32,
    timestamp: i64,
    db: State<'_, LibraryDb>,
) -> Result<(), AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;

        let session_key = match library::get_setting(&conn, "lastfm_session_key") {
            Some(sk) => sk,
            None => {
                // Not connected — queue for later
                let entry = ScrobbleEntry {
                    artist,
                    track,
                    album,
                    album_artist,
                    duration_secs,
                    timestamp,
                };
                lastfm_queue::enqueue(&conn, &entry)?;
                return Ok::<_, String>(());
            }
        };

        let entry = ScrobbleEntry {
            artist,
            track,
            album,
            album_artist,
            duration_secs,
            timestamp,
        };

        match lastfm::scrobble(&session_key, std::slice::from_ref(&entry)) {
            Ok(result) => {
                log::info!(
                    "Scrobbled: {} accepted, {} ignored",
                    result.accepted,
                    result.ignored
                );
            }
            Err(e) => {
                log::warn!("Scrobble failed, queuing for retry: {}", e);
                lastfm_queue::enqueue(&conn, &entry)?;
            }
        }

        // Try flushing queued scrobbles while we're at it
        flush_queued_scrobbles(&conn, &session_key);

        Ok::<_, String>(())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn lastfm_set_scrobble_enabled(
    enabled: bool,
    db: State<'_, LibraryDb>,
) -> Result<(), AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::set_setting(
            &conn,
            "lastfm_scrobble_enabled",
            if enabled { "true" } else { "false" },
        )?;
        Ok::<_, String>(())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn lastfm_flush_queue(db: State<'_, LibraryDb>) -> Result<(), AppError> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        let session_key = match library::get_setting(&conn, "lastfm_session_key") {
            Some(sk) => sk,
            None => return Ok::<_, String>(()),
        };
        flush_queued_scrobbles(&conn, &session_key);
        Ok::<_, String>(())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn lastfm_open_auth_url(url: String) -> Result<(), AppError> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {}", e))?;
    }
    Ok(())
}

/// Drain pending scrobbles in batches of 50. Best-effort: logs failures.
fn flush_queued_scrobbles(conn: &rusqlite::Connection, session_key: &str) {
    loop {
        let batch = match lastfm_queue::dequeue_batch(conn, 50) {
            Ok(b) if b.is_empty() => break,
            Ok(b) => b,
            Err(e) => {
                log::warn!("Failed to read scrobble queue: {}", e);
                break;
            }
        };

        let ids: Vec<i64> = batch.iter().map(|(id, _)| *id).collect();
        let entries: Vec<ScrobbleEntry> = batch.into_iter().map(|(_, e)| e).collect();

        match lastfm::scrobble(session_key, &entries) {
            Ok(result) => {
                log::info!(
                    "Flushed {} queued scrobbles ({} accepted, {} ignored)",
                    entries.len(),
                    result.accepted,
                    result.ignored
                );
                if let Err(e) = lastfm_queue::remove_by_ids(conn, &ids) {
                    log::warn!("Failed to remove flushed scrobbles: {}", e);
                    break;
                }
            }
            Err(e) => {
                log::warn!("Queue flush failed, will retry later: {}", e);
                break;
            }
        }
    }
}
