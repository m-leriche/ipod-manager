mod albumart;
mod audioquality;
mod commands;
mod disk;
mod files;
mod localvideo;
mod metadata;
mod profiles;
mod youtube;

use files::SyncCancel;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(SyncCancel::new())
        .setup(|app| {
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
            commands::check_yt_dependencies,
            commands::fetch_video_info,
            commands::download_audio,
            commands::check_ffmpeg,
            commands::probe_video,
            commands::extract_audio_from_video,
            commands::scan_metadata,
            commands::save_metadata,
            commands::scan_audio_quality,
            commands::generate_spectrogram,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
