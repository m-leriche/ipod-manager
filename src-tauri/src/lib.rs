mod albumart;
mod audio_utils;
mod audioquality;
mod commands;
mod disk;
mod files;
mod ipod_info;
mod library;
mod libstats;
mod localvideo;
mod metadata;
mod metarepair;
mod musicbrainz;
mod profiles;
mod rockbox;
mod sanitize;
mod streaming;
mod youtube;

use files::SyncCancel;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    ensure_homebrew_path();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .register_uri_scheme_protocol("stream", |ctx, request| {
            streaming::handle_request(ctx, request)
        })
        .manage(SyncCancel::new())
        .setup(|app| {
            // Initialize library database
            let db_path = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to resolve app data dir: {}", e))
                .unwrap()
                .join("library.db");

            let conn = library::init_db(&db_path).expect("Failed to initialize library database");

            app.manage(LibraryDb::new(conn));

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // ── Native macOS menu bar ───────────────────────────────────
            let settings_item = MenuItemBuilder::new("Settings...")
                .id("settings")
                .accelerator("CmdOrCtrl+,")
                .build(app)?;

            let app_submenu = Submenu::with_items(
                app,
                "Crate",
                true,
                &[
                    &PredefinedMenuItem::about(app, Some("About Crate"), None)?,
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
            commands::get_profiles,
            commands::save_profiles,
            commands::get_browse_profiles,
            commands::save_browse_profiles,
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
            commands::repair_analyze,
            commands::repair_compare_release,
            commands::scan_audio_quality,
            commands::generate_spectrogram,
            commands::generate_waveform,
            commands::scan_library_stats,
            commands::get_ipod_info,
            commands::read_rockbox_playdata,
            commands::get_library_location,
            commands::set_library_location,
            commands::import_to_library,
            commands::add_library_folder,
            commands::delete_library_tracks,
            commands::flag_tracks,
            commands::remove_library_folder,
            commands::get_library_folders,
            commands::refresh_library,
            commands::get_library_tracks,
            commands::get_library_browser_data,
            commands::get_library_artists,
            commands::get_library_albums,
            commands::get_library_genres,
            commands::search_library,
            commands::show_in_finder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
