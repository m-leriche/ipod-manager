mod acoustid;
mod albumart;
mod artist_releases;
mod audio;
mod audio_utils;
mod audioquality;
mod commands;
mod convert;
mod discover;
mod disk;
pub mod error;
mod ffprobe_meta;
mod files;
mod genre;
mod inbox;
mod ipod_info;
mod lastfm;
mod lastfm_queue;
mod library;
mod libstats;
mod localvideo;
mod lyrics;
mod mediakeys;
mod metadata;
mod metarepair;
mod musicbrainz;
mod network;
mod playlist_export;
mod process;
mod profiles;
mod recommend;
mod rockbox;
mod sanitize;
mod streaming;
mod subsonic;
mod thumbnail;
mod validation;
mod volume_monitor;
mod watcher;
mod youtube;

use files::{ArtRepairCancel, GenreLookupCancel, LyricsCancel, NewReleasesCancel, SyncCancel};
use library::LibraryDb;
use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager};

/// Ensure Homebrew binary paths are on PATH so bundled .app can find
/// tools like ffmpeg, ffprobe, and yt-dlp.
fn ensure_homebrew_path() {
    let path = std::env::var("PATH").unwrap_or_default();
    let extras = ["/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin"];
    let missing: Vec<&str> = extras
        .iter()
        .copied()
        .filter(|p| !path.contains(p))
        .collect();
    if !missing.is_empty() {
        let new_path = format!("{}:{}", missing.join(":"), path);
        std::env::set_var("PATH", new_path);
    }
}

/// Open the library database, walking the user through recovery instead of
/// crashing with a blank window when the file is damaged or unreadable.
/// Returns `None` when the user chooses to quit.
fn open_library_db_with_recovery(
    app: &tauri::App,
    db_path: &std::path::Path,
) -> Option<rusqlite::Connection> {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

    let first_err = match library::init_db(db_path) {
        Ok(conn) => return Some(conn),
        Err(e) => e,
    };
    log::error!("Library database failed to open: {first_err}");

    let latest_backup = library::backup::list_backups(db_path)
        .ok()
        .and_then(|b| b.into_iter().next());

    if let Some(backup) = latest_backup {
        let restore = app
            .dialog()
            .message(format!(
                "The library database could not be opened:\n\n{first_err}\n\nRestore the most recent backup?"
            ))
            .title("Library Database Damaged")
            .kind(MessageDialogKind::Error)
            .buttons(MessageDialogButtons::OkCancelCustom(
                "Restore Latest Backup".into(),
                "Quit".into(),
            ))
            .blocking_show();
        if !restore {
            return None;
        }
        if let Err(e) = library::backup::restore_backup(db_path, &backup.path) {
            log::error!("Backup restore failed: {e}");
        }
    } else {
        let reset = app
            .dialog()
            .message(format!(
                "The library database could not be opened and no backups exist:\n\n{first_err}\n\nStart with an empty library? The damaged file is kept alongside it."
            ))
            .title("Library Database Damaged")
            .kind(MessageDialogKind::Error)
            .buttons(MessageDialogButtons::OkCancelCustom(
                "Start With Empty Library".into(),
                "Quit".into(),
            ))
            .blocking_show();
        if !reset {
            return None;
        }
        set_aside_damaged_db(db_path);
    }

    match library::init_db(db_path) {
        Ok(conn) => Some(conn),
        Err(e) => {
            log::error!("Library database still unusable after recovery: {e}");
            app.dialog()
                .message(format!("Recovery failed:\n\n{e}"))
                .title("Library Database Damaged")
                .kind(MessageDialogKind::Error)
                .blocking_show();
            None
        }
    }
}

/// Move a damaged database (and its WAL/SHM sidecars) out of the way so a
/// fresh one can be created, preserving the bytes for manual salvage.
fn set_aside_damaged_db(db_path: &std::path::Path) {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    for suffix in ["", "-wal", "-shm"] {
        let src = std::path::PathBuf::from(format!("{}{suffix}", db_path.display()));
        if src.exists() {
            let dest =
                std::path::PathBuf::from(format!("{}.damaged-{ts}{suffix}", db_path.display()));
            let _ = std::fs::rename(&src, &dest);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    ensure_homebrew_path();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .register_uri_scheme_protocol("stream", |ctx, request| {
            streaming::handle_request(ctx, request)
        })
        .manage(SyncCancel::new())
        .manage(ArtRepairCancel::new())
        .manage(LyricsCancel::new())
        .manage(NewReleasesCancel::new())
        .manage(GenreLookupCancel::new())
        .setup(|app| {
            // Initialize library database
            let db_path = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to resolve app data dir: {}", e))?
                .join("library.db");

            let Some(conn) = open_library_db_with_recovery(app, &db_path) else {
                // The user declined recovery — exit cleanly, not via panic.
                std::process::exit(1);
            };

            app.manage(LibraryDb::new(conn, db_path.clone()));

            // Start filesystem watcher for library folders
            let folder_watcher = watcher::FolderWatcher::new();
            let db_arc = app.state::<LibraryDb>().conn_arc();
            let _ = watcher::restart_from_db(&folder_watcher, app.handle(), &db_arc);
            app.manage(folder_watcher);

            // Start inbox watcher if an inbox folder is configured
            let inbox_watcher = inbox::InboxWatcher::new();
            {
                let db = app.state::<LibraryDb>();
                let inbox_path = db
                    .lock_conn()
                    .ok()
                    .and_then(|conn| library::get_setting(&conn, inbox::INBOX_LOCATION_KEY));
                if let Some(path) = inbox_path {
                    let _ = inbox_watcher.watch(Some(path.into()), app.handle().clone());
                }
            }
            app.manage(inbox_watcher);

            // Start volume monitor for external drive mount/unmount detection
            let vol_monitor = volume_monitor::VolumeMonitor::new();
            let _ = vol_monitor.start(app.handle().clone());
            app.manage(vol_monitor);

            // Spawn native audio engine
            let audio_engine = audio::AudioEngine::spawn(app.handle().clone())
                .map_err(|e| format!("Failed to spawn audio engine: {}", e))?;
            app.manage(audio_engine);

            // Start Subsonic-compatible streaming server
            let subsonic_db_path = db_path.clone();
            let cache_dir = app
                .path()
                .app_cache_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("/tmp"))
                .join("thumbnails");
            let subsonic_port = {
                let db = app.state::<LibraryDb>();
                let conn = db.lock_conn()?;
                library::get_setting(&conn, "subsonic_port")
                    .and_then(|v| v.parse::<u16>().ok())
                    .unwrap_or(4533)
            };
            let (subsonic_user, subsonic_pass) = {
                let db = app.state::<LibraryDb>();
                let conn = db.lock_conn()?;
                let user = library::get_setting(&conn, "subsonic_username")
                    .unwrap_or_else(|| "admin".to_string());
                let pass = library::get_setting(&conn, "subsonic_password")
                    .unwrap_or_else(|| "admin".to_string());
                (user, pass)
            };
            let (subsonic_server, cache_handle) = subsonic::start_server(
                subsonic_db_path,
                cache_dir,
                subsonic_port,
                subsonic_user,
                subsonic_pass,
            );
            app.manage(subsonic_server);
            app.manage(cache_handle);

            // Initialize system media key handling (Now Playing integration)
            match mediakeys::init(app.handle()) {
                Ok(mk) => {
                    app.manage(mk);
                }
                Err(e) => {
                    log::warn!("Media keys unavailable: {}", e);
                }
            }

            {
                use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

                let log_plugin = if cfg!(debug_assertions) {
                    // Debug: log to stdout + log file at Info level
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .rotation_strategy(RotationStrategy::KeepOne)
                        .max_file_size(1_000_000)
                        .build()
                } else {
                    // Release: log to file only at Warn level for diagnostics
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Warn)
                        .targets([Target::new(TargetKind::LogDir { file_name: None })])
                        .rotation_strategy(RotationStrategy::KeepSome(3))
                        .max_file_size(5_000_000)
                        .build()
                };
                app.handle().plugin(log_plugin)?;
            }

            // ── Native macOS menu bar ───────────────────────────────────
            let settings_item = MenuItemBuilder::new("Settings...")
                .id("settings")
                .accelerator("CmdOrCtrl+,")
                .build(app)?;

            let check_updates_item = MenuItemBuilder::new("Check for Updates...")
                .id("check-updates")
                .build(app)?;

            let app_submenu = Submenu::with_items(
                app,
                "Crate",
                true,
                &[
                    &PredefinedMenuItem::about(app, Some("About Crate"), None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &check_updates_item,
                    &PredefinedMenuItem::separator(app)?,
                    &settings_item,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::services(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::show_all(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?;

            let edit_submenu = Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?;

            let window_submenu = Submenu::with_items(
                app,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(app, None)?,
                    &PredefinedMenuItem::maximize(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::close_window(app, None)?,
                ],
            )?;

            let menu = Menu::with_items(app, &[&app_submenu, &edit_submenu, &window_submenu])?;

            app.set_menu(menu)?;

            app.on_menu_event(move |app_handle, event| {
                if event.id().as_ref() == "settings" {
                    let _ = app_handle.emit("open-settings", ());
                } else if event.id().as_ref() == "check-updates" {
                    let _ = app_handle.emit("check-for-updates", ());
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::detect_ipod,
            commands::mount_ipod,
            commands::unmount_ipod,
            commands::list_directory,
            commands::compare_directories,
            commands::copy_files,
            commands::delete_files,
            commands::cancel_sync,
            commands::scan_album_art,
            commands::fix_album_art,
            commands::delete_entry,
            commands::rename_entry,
            commands::create_folder,
            commands::move_files,
            commands::get_file_manager_profiles,
            commands::save_file_manager_profiles,
            commands::check_yt_dependencies,
            commands::fetch_video_info,
            commands::download_audio,
            commands::check_ffmpeg,
            commands::probe_video,
            commands::get_accurate_duration,
            commands::extract_audio_from_video,
            commands::scan_metadata_paths,
            commands::scan_metadata,
            commands::sanitize_tags,
            commands::save_metadata,
            commands::get_id3_version,
            commands::set_id3_version,
            commands::repair_analyze,
            commands::repair_compare_release,
            commands::lookup_album_years,
            commands::lookup_album_genres,
            commands::cancel_genre_lookup,
            commands::scan_audio_quality,
            commands::scan_audio_quality_paths,
            commands::generate_spectrogram,
            commands::generate_waveform,
            commands::scan_library_stats,
            commands::get_library_stats,
            commands::get_ipod_info,
            commands::read_rockbox_playdata,
            commands::write_rockbox_playdata,
            commands::check_library_available,
            commands::get_library_location,
            commands::set_library_location,
            commands::import_to_library,
            commands::add_library_folder,
            commands::delete_library_tracks,
            commands::flag_tracks,
            commands::rate_tracks,
            commands::increment_play_count,
            commands::remove_library_folder,
            commands::get_library_folders,
            commands::refresh_library,
            commands::background_rescan,
            commands::get_library_tracks,
            commands::get_library_browser_data,
            commands::get_library_browser_data_paginated,
            commands::get_library_tracks_page,
            commands::get_library_artists,
            commands::get_library_albums,
            commands::get_library_genres,
            commands::search_library,
            commands::show_in_finder,
            commands::audio_play,
            commands::audio_pause,
            commands::audio_resume,
            commands::audio_stop,
            commands::audio_seek,
            commands::audio_set_volume,
            commands::audio_preload_next,
            commands::audio_get_status,
            commands::audio_set_eq,
            commands::audio_set_speed,
            commands::audio_set_crossfade,
            commands::audio_set_replay_gain,
            commands::get_playlists,
            commands::create_playlist,
            commands::rename_playlist,
            commands::delete_playlist,
            commands::get_playlist_tracks,
            commands::add_tracks_to_playlist,
            commands::remove_tracks_from_playlist,
            commands::move_playlist_track,
            commands::export_playlists_to_ipod,
            commands::detect_duplicates,
            commands::delete_duplicate_tracks,
            commands::get_smart_playlists,
            commands::create_smart_playlist,
            commands::update_smart_playlist,
            commands::delete_smart_playlist,
            commands::get_smart_playlist_tracks,
            commands::get_playlist_recommendations,
            commands::media_set_metadata,
            commands::media_set_playback,
            commands::check_fpcalc,
            commands::identify_tracks,
            commands::probe_audio_files,
            commands::convert_audio,
            commands::restart_watcher,
            commands::fix_library_album_art,
            commands::upload_album_art,
            commands::cancel_art_repair,
            commands::get_thumbnail,
            commands::invalidate_thumbnail,
            commands::lastfm_get_token,
            commands::lastfm_get_session,
            commands::lastfm_disconnect,
            commands::lastfm_get_status,
            commands::lastfm_update_now_playing,
            commands::lastfm_scrobble,
            commands::lastfm_set_scrobble_enabled,
            commands::lastfm_flush_queue,
            commands::lastfm_open_auth_url,
            commands::get_lyrics,
            commands::fetch_lyrics,
            commands::save_lyrics,
            commands::remove_lyrics,
            commands::write_lyrics_to_file,
            commands::fetch_library_lyrics,
            commands::cancel_lyrics_fetch,
            commands::reset_lyrics_not_found,
            commands::count_lyrics_not_found,
            commands::get_library_health,
            commands::get_health_issue_tracks,
            commands::export_library,
            commands::import_library,
            commands::backup_library,
            commands::list_library_backups,
            commands::restore_library_backup,
            commands::get_subsonic_status,
            commands::set_subsonic_credentials,
            commands::set_subsonic_port,
            commands::save_playback_queue,
            commands::load_playback_queue,
            commands::clear_playback_queue,
            commands::get_watched_artists,
            commands::watch_artist,
            commands::unwatch_artist,
            commands::is_artist_watched,
            commands::check_new_releases,
            commands::cancel_new_releases_check,
            commands::get_discovered_releases,
            commands::dismiss_release,
            commands::search_artist_mbid,
            commands::set_watched_artist_mbid,
            commands::get_artists_with_new_releases,
            commands::get_last_releases_check,
            commands::clear_discovered_releases,
            commands::get_discover_feed,
            commands::refresh_discover_feed,
            commands::get_discover_tag_albums,
            commands::search_discover,
            commands::replace_discover_section,
            commands::replace_discover_album,
            commands::save_discover_snapshot,
            commands::get_discover_enabled,
            commands::set_discover_enabled,
            commands::get_inbox_location,
            commands::set_inbox_location,
            commands::scan_inbox,
            commands::verify_inbox_tracklist,
            commands::convert_inbox_album,
            commands::file_inbox_album,
            commands::delete_inbox_folders,
            commands::undo_inbox_filing,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                // Fold the WAL back into the main file on clean exit so the
                // sidecar doesn't grow unbounded across long sessions.
                if let Some(db) = app.try_state::<LibraryDb>() {
                    if let Ok(conn) = db.lock_conn() {
                        let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
                    }
                }
            }
        });
}
