//! Process-level startup concerns: PATH fixup for bundled tools and the
//! library-database open/recovery dialog flow that runs before the UI.

use crate::library;

/// Ensure Homebrew binary paths are on PATH so bundled .app can find
/// tools like ffmpeg, ffprobe, and yt-dlp.
pub fn ensure_homebrew_path() {
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
/// crashing with a blank window when the file is damaged. Non-corruption
/// failures (locked DB from a second instance, full disk) get a plain error
/// dialog with no destructive options. Returns `None` when the app should
/// quit.
pub fn open_library_db_with_recovery(
    app: &tauri::App,
    db_path: &std::path::Path,
) -> Option<rusqlite::Connection> {
    use library::recovery;
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

    let first_err = match library::init_db(db_path) {
        Ok(conn) => return Some(conn),
        Err(e) => e,
    };
    log::error!("Library database failed to open: {first_err}");

    let error_dialog = |message: String| {
        app.dialog()
            .message(message)
            .title("Library Database Error")
            .kind(MessageDialogKind::Error)
            .blocking_show();
    };

    // Only genuine corruption warrants overwriting/renaming the file — a
    // locked or disk-full database is healthy and must be left alone.
    if !recovery::is_corruption_error(&first_err) {
        error_dialog(format!(
            "The library database could not be opened:\n\n{first_err}\n\nIs another copy of Crate running, or the disk full? The database was not modified — quit and try again."
        ));
        return None;
    }

    let has_backups = !library::backup::list_backups(db_path)
        .unwrap_or_default()
        .is_empty();

    if has_backups {
        let restore = app
            .dialog()
            .message(format!(
                "The library database is damaged:\n\n{first_err}\n\nRestore from backup? Backups are tried newest-first; the damaged file is kept alongside for manual salvage."
            ))
            .title("Library Database Damaged")
            .kind(MessageDialogKind::Error)
            .buttons(MessageDialogButtons::OkCancelCustom(
                "Restore From Backup".into(),
                "Quit".into(),
            ))
            .blocking_show();
        if !restore {
            return None;
        }
        // Set the damaged files aside BEFORE any restore copies over them —
        // the WAL may hold the newest committed writes and stays salvageable.
        recovery::set_aside_damaged_db(db_path);
        if let Some(conn) = recovery::restore_from_backups(db_path) {
            return Some(conn);
        }
        let fresh = app
            .dialog()
            .message("Every backup failed to restore (details in the log). Start with an empty library? The damaged database was preserved next to it.")
            .title("Library Database Damaged")
            .kind(MessageDialogKind::Error)
            .buttons(MessageDialogButtons::OkCancelCustom(
                "Start With Empty Library".into(),
                "Quit".into(),
            ))
            .blocking_show();
        if !fresh {
            return None;
        }
    } else {
        let reset = app
            .dialog()
            .message(format!(
                "The library database is damaged and no backups exist:\n\n{first_err}\n\nStart with an empty library? The damaged file is kept alongside it."
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
        recovery::set_aside_damaged_db(db_path);
    }

    match recovery::start_fresh(db_path) {
        Ok(conn) => Some(conn),
        Err(e) => {
            log::error!("Fresh library creation failed: {e}");
            error_dialog(format!("Recovery failed:\n\n{e}"));
            None
        }
    }
}
