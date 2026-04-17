mod albumart;
mod audio_utils;
mod audioquality;
mod commands;
mod disk;
mod files;
mod library;
mod libstats;
mod localvideo;
mod metadata;
mod metarepair;
mod musicbrainz;
mod profiles;
mod rockbox;
mod sanitize;
mod youtube;

use files::SyncCancel;
use library::LibraryDb;
use tauri::Manager;

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
            commands::read_rockbox_playdata,
            commands::add_library_folder,
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
