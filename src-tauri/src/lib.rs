mod commands;
mod disk;
mod files;

use files::SyncCancel;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
