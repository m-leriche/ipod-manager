//! Cached quality verdicts keyed by file path + mtime + size, so a re-scan
//! skips the ffprobe/ffmpeg process spawns for unchanged files.

use rusqlite::params;
use std::collections::HashMap;
use std::path::Path;
use std::time::UNIX_EPOCH;

use super::AudioFileInfo;
use crate::library::{lock_shared, SharedConn};

/// On-disk identity of a file at probe time. A cached verdict is reused only
/// when both fields still match.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct FileStamp {
    pub mtime: i64,
    pub size: i64,
}

pub(super) fn file_stamp(path: &Path) -> Option<FileStamp> {
    let meta = std::fs::metadata(path).ok()?;
    let mtime = meta
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_secs() as i64;
    Some(FileStamp {
        mtime,
        size: meta.len() as i64,
    })
}

/// Load every cached verdict in one query, keyed by file path.
/// Rows with unparseable JSON are silently dropped (treated as cache misses).
pub(super) fn load_verdicts(
    conn: &SharedConn,
) -> Result<HashMap<String, (FileStamp, AudioFileInfo)>, String> {
    let c = lock_shared(conn)?;
    let mut stmt = c
        .prepare("SELECT file_path, mtime, file_size, info_json FROM quality_cache")
        .map_err(|e| format!("Cache query failed: {}", e))?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(|e| format!("Cache query failed: {}", e))?;

    let mut map = HashMap::new();
    for (path, mtime, size, json) in rows.filter_map(|r| r.ok()) {
        if let Ok(info) = serde_json::from_str::<AudioFileInfo>(&json) {
            map.insert(path, (FileStamp { mtime, size }, info));
        }
    }
    Ok(map)
}

/// Return the cached verdict for `path` when its mtime and size still match.
pub(super) fn lookup<'a>(
    cache: &'a HashMap<String, (FileStamp, AudioFileInfo)>,
    path: &str,
    stamp: FileStamp,
) -> Option<&'a AudioFileInfo> {
    let (cached_stamp, info) = cache.get(path)?;
    (*cached_stamp == stamp).then_some(info)
}

/// Upsert freshly probed verdicts in one transaction.
pub(super) fn store_verdicts(
    conn: &SharedConn,
    entries: &[(AudioFileInfo, FileStamp)],
) -> Result<(), String> {
    if entries.is_empty() {
        return Ok(());
    }
    let c = lock_shared(conn)?;
    let tx = c
        .unchecked_transaction()
        .map_err(|e| format!("Cache transaction failed: {}", e))?;
    for (info, stamp) in entries {
        let json =
            serde_json::to_string(info).map_err(|e| format!("Cache serialize failed: {}", e))?;
        tx.execute(
            "INSERT INTO quality_cache (file_path, mtime, file_size, info_json)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(file_path) DO UPDATE SET
                 mtime = excluded.mtime,
                 file_size = excluded.file_size,
                 info_json = excluded.info_json",
            params![info.file_path, stamp.mtime, stamp.size, json],
        )
        .map_err(|e| format!("Cache write failed: {}", e))?;
    }
    tx.commit()
        .map_err(|e| format!("Cache commit failed: {}", e))
}

// ── Tests ───────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::init_db;
    use std::sync::{Arc, Mutex};

    fn make_db() -> (tempfile::TempDir, SharedConn) {
        let tmp = tempfile::tempdir().unwrap();
        let conn = init_db(&tmp.path().join("library.db")).unwrap();
        (tmp, Arc::new(Mutex::new(conn)))
    }

    fn fake_info(path: &str, verdict: &str) -> AudioFileInfo {
        AudioFileInfo {
            file_path: path.to_string(),
            file_name: "a.flac".to_string(),
            codec: "flac".to_string(),
            sample_rate: 44100,
            bit_depth: Some(16),
            bitrate: Some(900_000),
            channels: 2,
            duration: 180.0,
            is_lossless_container: true,
            verdict: verdict.to_string(),
            verdict_reason: "FLAC 44.1kHz / 16-bit".to_string(),
        }
    }

    #[test]
    fn hit_on_matching_mtime_and_size() {
        let (_tmp, db) = make_db();
        let stamp = FileStamp {
            mtime: 100,
            size: 2048,
        };
        store_verdicts(&db, &[(fake_info("/music/a.flac", "lossless"), stamp)]).unwrap();

        let cache = load_verdicts(&db).unwrap();
        let hit = lookup(&cache, "/music/a.flac", stamp).unwrap();
        assert_eq!(hit.verdict, "lossless");
        assert_eq!(hit.sample_rate, 44100);
    }

    #[test]
    fn miss_on_changed_mtime_or_size() {
        let (_tmp, db) = make_db();
        let stamp = FileStamp {
            mtime: 100,
            size: 2048,
        };
        store_verdicts(&db, &[(fake_info("/music/a.flac", "lossless"), stamp)]).unwrap();

        let cache = load_verdicts(&db).unwrap();
        let changed_mtime = FileStamp {
            mtime: 101,
            size: 2048,
        };
        assert!(lookup(&cache, "/music/a.flac", changed_mtime).is_none());
        let changed_size = FileStamp {
            mtime: 100,
            size: 4096,
        };
        assert!(lookup(&cache, "/music/a.flac", changed_size).is_none());
        assert!(lookup(&cache, "/music/missing.flac", stamp).is_none());
    }

    #[test]
    fn upsert_overwrites_existing_row() {
        let (_tmp, db) = make_db();
        let old_stamp = FileStamp {
            mtime: 100,
            size: 2048,
        };
        store_verdicts(&db, &[(fake_info("/music/a.flac", "lossless"), old_stamp)]).unwrap();

        let new_stamp = FileStamp {
            mtime: 200,
            size: 3000,
        };
        store_verdicts(&db, &[(fake_info("/music/a.flac", "suspect"), new_stamp)]).unwrap();

        let cache = load_verdicts(&db).unwrap();
        assert_eq!(cache.len(), 1);
        assert!(lookup(&cache, "/music/a.flac", old_stamp).is_none());
        assert_eq!(
            lookup(&cache, "/music/a.flac", new_stamp).unwrap().verdict,
            "suspect"
        );
    }
}
