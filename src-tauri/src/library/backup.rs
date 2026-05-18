use rusqlite::Connection;
use serde::Serialize;
use std::fs;
use std::io::Read as _;
use std::path::{Path, PathBuf};

/// Maximum number of automatic backups to keep before pruning old ones.
const MAX_BACKUPS: usize = 10;

#[derive(Debug, Clone, Serialize)]
pub struct BackupInfo {
    pub path: String,
    pub size: u64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct RestoreResult {
    pub restored_from: String,
    /// The app should be restarted after a restore so the live database
    /// connection picks up the restored data.
    pub restart_required: bool,
}

/// Create a timestamped backup of the library database using SQLite's
/// online backup API. This is safe to call while the database is open
/// and produces a consistent snapshot even with concurrent readers/writers.
pub fn create_backup(conn: &Connection, db_path: &Path) -> Result<BackupInfo, String> {
    let backup_dir = backup_dir(db_path);
    fs::create_dir_all(&backup_dir).map_err(|e| format!("Failed to create backup dir: {}", e))?;

    // Use millisecond precision to avoid collisions when two backups
    // are created within the same second (e.g. manual + auto-backup).
    let timestamp_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let backup_name = format!("library_{}.db", timestamp_ms);
    let backup_path = backup_dir.join(&backup_name);

    // Use SQLite's backup API for a consistent snapshot
    let mut dest = rusqlite::Connection::open(&backup_path)
        .map_err(|e| format!("Failed to open backup file: {}", e))?;
    let backup = rusqlite::backup::Backup::new(conn, &mut dest)
        .map_err(|e| format!("Failed to init backup: {}", e))?;
    backup
        .run_to_completion(100, std::time::Duration::from_millis(10), None)
        .map_err(|e| format!("Backup failed: {}", e))?;
    drop(backup);
    drop(dest);

    let size = fs::metadata(&backup_path).map(|m| m.len()).unwrap_or(0);

    prune_old_backups(&backup_dir);

    Ok(BackupInfo {
        path: backup_path.to_string_lossy().to_string(),
        size,
        created_at: timestamp_ms,
    })
}

/// List existing backups, newest first.
pub fn list_backups(db_path: &Path) -> Result<Vec<BackupInfo>, String> {
    let backup_dir = backup_dir(db_path);
    if !backup_dir.exists() {
        return Ok(Vec::new());
    }

    let mut backups: Vec<BackupInfo> = fs::read_dir(&backup_dir)
        .map_err(|e| format!("Failed to read backup dir: {}", e))?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with("library_") || !name.ends_with(".db") {
                return None;
            }
            let meta = entry.metadata().ok()?;
            let timestamp = name
                .strip_prefix("library_")?
                .strip_suffix(".db")?
                .parse::<i64>()
                .ok()?;
            Some(BackupInfo {
                path: entry.path().to_string_lossy().to_string(),
                size: meta.len(),
                created_at: timestamp,
            })
        })
        .collect();

    backups.sort_by_key(|b| std::cmp::Reverse(b.created_at));
    Ok(backups)
}

/// Restore the library database from a backup file.
/// Replaces the current database by closing the connection,
/// copying the backup over, and returning success.
///
/// The caller is responsible for re-opening the database connection.
pub fn restore_backup(db_path: &Path, backup_path: &str) -> Result<RestoreResult, String> {
    let backup = Path::new(backup_path);
    if !backup.exists() {
        return Err(format!("Backup file not found: {}", backup_path));
    }

    // Validate the SQLite magic header (first 16 bytes only)
    let mut header = [0u8; 16];
    let mut file = fs::File::open(backup).map_err(|e| format!("Failed to open backup: {}", e))?;
    file.read_exact(&mut header)
        .map_err(|e| format!("Failed to read backup header: {}", e))?;
    if header != *b"SQLite format 3\0" {
        return Err("Invalid backup file: not a SQLite database".to_string());
    }
    drop(file);

    fs::copy(backup, db_path).map_err(|e| format!("Failed to restore backup: {}", e))?;

    // Remove WAL and SHM files so SQLite doesn't try to replay old journal
    let wal_path = db_path.with_extension("db-wal");
    let shm_path = db_path.with_extension("db-shm");
    let _ = fs::remove_file(wal_path);
    let _ = fs::remove_file(shm_path);

    Ok(RestoreResult {
        restored_from: backup_path.to_string(),
        restart_required: true,
    })
}

fn backup_dir(db_path: &Path) -> PathBuf {
    db_path.parent().unwrap_or(Path::new(".")).join("backups")
}

fn prune_old_backups(backup_dir: &Path) {
    let dir_iter = match fs::read_dir(backup_dir) {
        Ok(iter) => iter,
        Err(e) => {
            log::warn!("Failed to read backup dir for pruning: {}", e);
            return;
        }
    };

    let mut entries: Vec<(PathBuf, i64)> = dir_iter
        .filter_map(|e| {
            let entry = e.ok()?;
            let name = entry.file_name().to_string_lossy().to_string();
            let ts = name
                .strip_prefix("library_")?
                .strip_suffix(".db")?
                .parse::<i64>()
                .ok()?;
            Some((entry.path(), ts))
        })
        .collect();

    entries.sort_by_key(|e| std::cmp::Reverse(e.1));

    for (path, _) in entries.iter().skip(MAX_BACKUPS) {
        let _ = fs::remove_file(path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::init_db;

    fn setup_test_db() -> (tempfile::TempDir, PathBuf, Connection) {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("library.db");
        let conn = init_db(&db_path).unwrap();
        (dir, db_path, conn)
    }

    #[test]
    fn create_and_list_backups() {
        let (_dir, db_path, conn) = setup_test_db();

        let info = create_backup(&conn, &db_path).unwrap();
        assert!(info.size > 0);
        assert!(Path::new(&info.path).exists());

        let list = list_backups(&db_path).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].path, info.path);
    }

    #[test]
    fn restore_replaces_database() {
        let (_dir, db_path, conn) = setup_test_db();

        // Insert a track
        conn.execute(
            "INSERT INTO tracks (file_path, file_name, folder_path, format) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["/test.mp3", "test.mp3", "/", "mp3"],
        )
        .unwrap();

        // Back up
        let backup = create_backup(&conn, &db_path).unwrap();

        // Delete the track
        conn.execute("DELETE FROM tracks", []).unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM tracks", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);

        // Close connection before restore
        drop(conn);

        // Restore from backup
        restore_backup(&db_path, &backup.path).unwrap();

        // Re-open and verify track is back
        let conn2 = Connection::open(&db_path).unwrap();
        let count: i64 = conn2
            .query_row("SELECT COUNT(*) FROM tracks", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn restore_rejects_invalid_file() {
        let dir = tempfile::tempdir().unwrap();
        let fake = dir.path().join("not_sqlite.db");
        fs::write(&fake, b"this is not a database").unwrap();
        let db_path = dir.path().join("library.db");

        let result = restore_backup(&db_path, fake.to_str().unwrap());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not a SQLite database"));
    }

    #[test]
    fn restore_rejects_missing_file() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("library.db");

        let result = restore_backup(&db_path, "/nonexistent/backup.db");
        assert!(result.is_err());
    }

    #[test]
    fn list_backups_empty_dir() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("library.db");
        let list = list_backups(&db_path).unwrap();
        assert!(list.is_empty());
    }

    #[test]
    fn prune_keeps_max_backups() {
        let (_dir, db_path, conn) = setup_test_db();
        let backup_dir = db_path.parent().unwrap().join("backups");
        fs::create_dir_all(&backup_dir).unwrap();

        // Create MAX_BACKUPS + 3 backup files with distinct timestamps
        // directly, to avoid relying on wall-clock millisecond gaps.
        for i in 0..(MAX_BACKUPS + 3) {
            let name = format!("library_{}.db", 1000 + i);
            let path = backup_dir.join(&name);
            // Write a minimal SQLite-like file so list_backups picks it up
            fs::write(&path, b"placeholder").unwrap();
        }

        // Verify all 13 exist before pruning
        let before: Vec<_> = fs::read_dir(&backup_dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .collect();
        assert_eq!(before.len(), MAX_BACKUPS + 3);

        // Run a real backup which triggers prune
        create_backup(&conn, &db_path).unwrap();

        let list = list_backups(&db_path).unwrap();
        // MAX_BACKUPS + 3 pre-existing + 1 from create_backup = 14,
        // pruned down to MAX_BACKUPS
        assert_eq!(list.len(), MAX_BACKUPS);
    }
}
