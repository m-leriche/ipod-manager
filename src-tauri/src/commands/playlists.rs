use crate::library::{self, LibraryDb};
use crate::playlist_export;
use tauri::State;

#[tauri::command]
pub async fn get_playlists(db: State<'_, LibraryDb>) -> Result<Vec<library::Playlist>, String> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::playlists::get_playlists(&conn)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn create_playlist(
    name: String,
    db: State<'_, LibraryDb>,
) -> Result<library::Playlist, String> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::playlists::create_playlist(&conn, &name)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn rename_playlist(
    id: i64,
    name: String,
    db: State<'_, LibraryDb>,
) -> Result<(), String> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::playlists::rename_playlist(&conn, id, &name)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn delete_playlist(id: i64, db: State<'_, LibraryDb>) -> Result<(), String> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::playlists::delete_playlist(&conn, id)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_playlist_tracks(
    playlist_id: i64,
    db: State<'_, LibraryDb>,
) -> Result<Vec<library::PlaylistTrack>, String> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::playlists::get_playlist_tracks(&conn, playlist_id)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn add_tracks_to_playlist(
    playlist_id: i64,
    track_ids: Vec<i64>,
    db: State<'_, LibraryDb>,
) -> Result<(), String> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::playlists::add_tracks_to_playlist(&conn, playlist_id, &track_ids)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn remove_tracks_from_playlist(
    playlist_id: i64,
    track_ids: Vec<i64>,
    db: State<'_, LibraryDb>,
) -> Result<(), String> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::playlists::remove_tracks_from_playlist(&conn, playlist_id, &track_ids)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn move_playlist_track(
    playlist_id: i64,
    from_position: u32,
    to_position: u32,
    db: State<'_, LibraryDb>,
) -> Result<(), String> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::playlists::move_playlist_track(&conn, playlist_id, from_position, to_position)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn export_playlists_to_ipod(
    playlist_ids: Vec<i64>,
    output_dir: String,
    music_subdir: Option<String>,
    db: State<'_, LibraryDb>,
) -> Result<playlist_export::PlaylistExportResult, String> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;

        let library_root = library::get_library_location(&conn).ok_or_else(|| {
            "No library location configured. Set one in Settings first.".to_string()
        })?;

        let sub = music_subdir.unwrap_or_else(|| "Music".to_string());

        let all_playlists = library::playlists::get_playlists(&conn)?;
        let target: Vec<_> = if playlist_ids.is_empty() {
            all_playlists
        } else {
            all_playlists
                .into_iter()
                .filter(|p| playlist_ids.contains(&p.id))
                .collect()
        };

        let mut with_tracks = Vec::new();
        for pl in target {
            let tracks = library::playlists::get_playlist_tracks(&conn, pl.id)?;
            with_tracks.push((pl, tracks));
        }

        Ok(playlist_export::export_playlists(
            with_tracks,
            &library_root,
            &sub,
            &output_dir,
        ))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

// ── Smart playlists ──────────────────────────────────────────────

#[tauri::command]
pub async fn get_smart_playlists(
    db: State<'_, LibraryDb>,
) -> Result<Vec<library::SmartPlaylist>, String> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::smart_playlists::get_smart_playlists(&conn)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn create_smart_playlist(
    name: String,
    rules: library::SmartPlaylistRuleGroup,
    sort_by: Option<String>,
    sort_direction: Option<String>,
    limit: Option<u32>,
    db: State<'_, LibraryDb>,
) -> Result<library::SmartPlaylist, String> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::smart_playlists::create_smart_playlist(
            &conn,
            &name,
            &rules,
            sort_by.as_deref(),
            sort_direction.as_deref(),
            limit,
        )
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn update_smart_playlist(
    id: i64,
    name: String,
    rules: library::SmartPlaylistRuleGroup,
    sort_by: Option<String>,
    sort_direction: Option<String>,
    limit: Option<u32>,
    db: State<'_, LibraryDb>,
) -> Result<(), String> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::smart_playlists::update_smart_playlist(
            &conn,
            id,
            &name,
            &rules,
            sort_by.as_deref(),
            sort_direction.as_deref(),
            limit,
        )
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn delete_smart_playlist(id: i64, db: State<'_, LibraryDb>) -> Result<(), String> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::smart_playlists::delete_smart_playlist(&conn, id)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_smart_playlist_tracks(
    id: i64,
    db: State<'_, LibraryDb>,
) -> Result<Vec<library::LibraryTrack>, String> {
    let conn_arc = db.conn_arc();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = conn_arc
            .lock()
            .map_err(|e| format!("DB lock failed: {}", e))?;
        library::smart_playlists::get_smart_playlist_tracks(&conn, id)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}
