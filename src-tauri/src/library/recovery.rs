//! Recovery paths for a library database that fails to open: classifying the
//! failure, preserving the damaged files, and restoring from backups. The
//! dialog flow that drives these lives in `lib.rs`; everything here is pure
//! so it can be tested without a running app.

use rusqlite::Connection;
use std::path::{Path, PathBuf};

use super::backup;

/// True when an `init_db` error indicates actual file corruption — the only
/// case where offering a destructive restore/reset is appropriate. A locked
/// database (second instance) or a full disk must NOT be "recovered" by
/// overwriting a healthy file with an older backup.
pub fn is_corruption_error(err: &str) -> bool {
    let e = err.to_lowercase();
    e.contains("integrity check failed")
        || e.contains("database disk image is malformed")
        || e.contains("file is not a database")
        || e.contains("not a database")
        || e.contains("unsupported file format")
}

/// Move a damaged database (and its WAL/SHM sidecars) out of the way,
/// preserving the bytes for manual salvage — the WAL may hold the newest
/// committed transactions and is often recoverable with `.recover`.
pub fn set_aside_damaged_db(db_path: &Path) {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    for suffix in ["", "-wal", "-shm"] {
        let src = PathBuf::from(format!("{}{suffix}", db_path.display()));
        if src.exists() {
            let dest = PathBuf::from(format!("{}.damaged-{ts}{suffix}", db_path.display()));
            let _ = std::fs::rename(&src, &dest);
        }
    }
}

/// Try every backup, newest first, until one restores AND opens cleanly.
/// The caller must have set the damaged original aside already. Failures are
/// logged per backup; `None` means every backup failed.
pub fn restore_from_backups(db_path: &Path) -> Option<Connection> {
    let backups = backup::list_backups(db_path).unwrap_or_default();
    for b in &backups {
        match backup::restore_backup(db_path, &b.path) {
            Ok(_) => match super::init_db(db_path) {
                Ok(conn) => {
                    log::info!("Restored library from backup: {}", b.path);
                    return Some(conn);
                }
                Err(e) => log::error!("Backup {} restored but failed to open: {e}", b.path),
            },
            Err(e) => log::error!("Restore from {} failed: {e}", b.path),
        }
    }
    None
}

/// Remove any leftover (possibly partially-restored) database files and
/// create a fresh, empty library.
pub fn start_fresh(db_path: &Path) -> Result<Connection, String> {
    for suffix in ["", "-wal", "-shm"] {
        let _ = std::fs::remove_file(format!("{}{suffix}", db_path.display()));
    }
    super::init_db(db_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn corruption_errors_are_classified() {
        assert!(is_corruption_error(
            "Database integrity check failed: page 3 is never used"
        ));
        assert!(is_corruption_error(
            "Failed to open library db: file is not a database"
        ));
        assert!(!is_corruption_error(
            "Failed to open library db: database is locked"
        ));
        assert!(!is_corruption_error(
            "Migration failed (ALTER ...): disk I/O error"
        ));
    }

    #[test]
    fn set_aside_preserves_all_sidecars() {
        let tmp = tempfile::tempdir().unwrap();
        let db = tmp.path().join("library.db");
        for suffix in ["", "-wal", "-shm"] {
            std::fs::write(format!("{}{suffix}", db.display()), b"bytes").unwrap();
        }

        set_aside_damaged_db(&db);

        for suffix in ["", "-wal", "-shm"] {
            assert!(!PathBuf::from(format!("{}{suffix}", db.display())).exists());
        }
        let preserved = std::fs::read_dir(tmp.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains(".damaged-"))
            .count();
        assert_eq!(preserved, 3);
    }

    #[test]
    fn restore_from_backups_skips_bad_and_uses_good() {
        let tmp = tempfile::tempdir().unwrap();
        let db_path = tmp.path().join("library.db");

        // A good backup (older) and a garbage one (newer).
        let conn = crate::library::init_db(&db_path).unwrap();
        conn.execute(
            "INSERT INTO tracks (file_path, file_name, folder_path, format) VALUES ('/a.mp3', 'a.mp3', '/', 'mp3')",
            [],
        )
        .unwrap();
        backup::create_backup(&conn, &db_path).unwrap();
        drop(conn);
        let backups_dir = tmp.path().join("backups");
        std::fs::write(backups_dir.join("library_99999999999999.db"), b"garbage").unwrap();

        set_aside_damaged_db(&db_path);
        let restored = restore_from_backups(&db_path).expect("good backup should restore");
        let count: i64 = restored
            .query_row("SELECT COUNT(*) FROM tracks", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn start_fresh_replaces_leftovers() {
        let tmp = tempfile::tempdir().unwrap();
        let db_path = tmp.path().join("library.db");
        std::fs::write(&db_path, b"partial garbage").unwrap();

        let conn = start_fresh(&db_path).unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM tracks", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }
}
