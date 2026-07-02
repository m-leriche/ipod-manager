use super::*;
use crate::library::{init_db, lock_shared, SharedConn};
use std::sync::Mutex;

fn make_db(dir: &Path) -> SharedConn {
    Arc::new(Mutex::new(
        init_db(&dir.join("library.db")).expect("init db"),
    ))
}

fn write_fake_audio(dir: &Path, name: &str) -> PathBuf {
    let p = dir.join(name);
    fs::write(&p, b"not really audio").expect("write file");
    p
}

fn track_count(db: &SharedConn) -> i64 {
    let c = lock_shared(db).unwrap();
    c.query_row("SELECT COUNT(*) FROM tracks", [], |r| r.get(0))
        .unwrap()
}

#[test]
fn sync_files_inserts_then_skips_unchanged() {
    let tmp = tempfile::tempdir().unwrap();
    let db = make_db(tmp.path());
    let cancel = Arc::new(AtomicBool::new(false));
    let files = vec![
        write_fake_audio(tmp.path(), "a.mp3"),
        write_fake_audio(tmp.path(), "b.mp3"),
    ];

    // First scan writes both files.
    assert_eq!(sync_files(&db, &files, None, None, &cancel).unwrap(), 2);
    assert_eq!(track_count(&db), 2);

    // Re-scan with nothing changed writes nothing.
    assert_eq!(sync_files(&db, &files, None, None, &cancel).unwrap(), 0);
    assert_eq!(track_count(&db), 2);
}

#[test]
fn sync_files_rewrites_on_mtime_change() {
    let tmp = tempfile::tempdir().unwrap();
    let db = make_db(tmp.path());
    let cancel = Arc::new(AtomicBool::new(false));
    let f = write_fake_audio(tmp.path(), "a.mp3");
    let files = vec![f.clone()];

    assert_eq!(sync_files(&db, &files, None, None, &cancel).unwrap(), 1);
    assert_eq!(sync_files(&db, &files, None, None, &cancel).unwrap(), 0);

    // mtime is second-granularity, so wait past a second boundary before
    // rewriting to guarantee a distinct modified time.
    std::thread::sleep(Duration::from_millis(1100));
    fs::write(&f, b"changed content").unwrap();

    assert_eq!(sync_files(&db, &files, None, None, &cancel).unwrap(), 1);
    assert_eq!(track_count(&db), 1);
}

#[test]
fn sync_files_bails_when_cancelled() {
    let tmp = tempfile::tempdir().unwrap();
    let db = make_db(tmp.path());
    let cancel = Arc::new(AtomicBool::new(true));
    let files = vec![write_fake_audio(tmp.path(), "a.mp3")];

    assert!(sync_files(&db, &files, None, None, &cancel).is_err());
    assert_eq!(track_count(&db), 0);
}

#[test]
fn sync_files_folder_scoped_skips_unchanged() {
    let tmp = tempfile::tempdir().unwrap();
    let db = make_db(tmp.path());
    let cancel = Arc::new(AtomicBool::new(false));
    let files = vec![write_fake_audio(tmp.path(), "a.mp3")];
    let scope = tmp.path().to_string_lossy().to_string();

    // First scoped scan inserts; a second with the same scope skips it.
    assert_eq!(
        sync_files(&db, &files, Some(&scope), None, &cancel).unwrap(),
        1
    );
    assert_eq!(
        sync_files(&db, &files, Some(&scope), None, &cancel).unwrap(),
        0
    );
    assert_eq!(track_count(&db), 1);
}

#[test]
fn delete_orphans_removes_only_missing_files() {
    let tmp = tempfile::tempdir().unwrap();
    let db = make_db(tmp.path());
    let cancel = Arc::new(AtomicBool::new(false));

    let present = write_fake_audio(tmp.path(), "present.mp3");
    let gone = write_fake_audio(tmp.path(), "gone.mp3");
    sync_files(&db, &[present.clone(), gone.clone()], None, None, &cancel).unwrap();
    assert_eq!(track_count(&db), 2);

    // The file backing one row disappears from disk.
    fs::remove_file(&gone).unwrap();

    let walked = walked_set(&[present.clone()]);
    let removed = delete_orphans(&db, &tmp.path().to_string_lossy(), &walked, None).unwrap();
    assert_eq!(removed, 1);
    assert_eq!(track_count(&db), 1);

    // The row whose file still exists must survive.
    let survivor: String = {
        let c = lock_shared(&db).unwrap();
        c.query_row("SELECT file_path FROM tracks", [], |r| r.get(0))
            .unwrap()
    };
    assert_eq!(survivor, present.to_string_lossy());
}

#[test]
fn delete_orphans_keeps_walked_files() {
    let tmp = tempfile::tempdir().unwrap();
    let db = make_db(tmp.path());
    let cancel = Arc::new(AtomicBool::new(false));
    let files = vec![
        write_fake_audio(tmp.path(), "a.mp3"),
        write_fake_audio(tmp.path(), "b.mp3"),
    ];
    sync_files(&db, &files, None, None, &cancel).unwrap();

    let removed = delete_orphans(
        &db,
        &tmp.path().to_string_lossy(),
        &walked_set(&files),
        None,
    )
    .unwrap();
    assert_eq!(removed, 0);
    assert_eq!(track_count(&db), 2);
}

#[test]
fn delete_orphans_keeps_unwalked_files_still_on_disk() {
    // A file the walk missed (e.g. an unreadable directory) but that still
    // exists on disk must survive — is_ghost_path re-verifies against the
    // real filesystem before anything is deleted.
    let tmp = tempfile::tempdir().unwrap();
    let db = make_db(tmp.path());
    let cancel = Arc::new(AtomicBool::new(false));
    let files = vec![write_fake_audio(tmp.path(), "a.mp3")];
    sync_files(&db, &files, None, None, &cancel).unwrap();

    let removed =
        delete_orphans(&db, &tmp.path().to_string_lossy(), &HashSet::new(), None).unwrap();
    assert_eq!(removed, 0);
    assert_eq!(track_count(&db), 1);
}

#[test]
fn delete_orphans_backs_up_before_deleting() {
    let tmp = tempfile::tempdir().unwrap();
    let db = make_db(tmp.path());
    let db_path = tmp.path().join("library.db");
    let cancel = Arc::new(AtomicBool::new(false));

    let present = write_fake_audio(tmp.path(), "present.mp3");
    let gone = write_fake_audio(tmp.path(), "gone.mp3");
    sync_files(&db, &[present.clone(), gone], None, None, &cancel).unwrap();

    // No orphans → no backup taken.
    let all = walked_set(&[present.clone(), tmp.path().join("gone.mp3")]);
    delete_orphans(&db, &tmp.path().to_string_lossy(), &all, Some(&db_path)).unwrap();
    assert!(crate::library::backup::list_backups(&db_path)
        .unwrap()
        .is_empty());

    // An actual deletion must snapshot the DB first.
    fs::remove_file(tmp.path().join("gone.mp3")).unwrap();
    let removed = delete_orphans(
        &db,
        &tmp.path().to_string_lossy(),
        &walked_set(&[present]),
        Some(&db_path),
    )
    .unwrap();
    assert_eq!(removed, 1);
    assert_eq!(
        crate::library::backup::list_backups(&db_path)
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn background_rescan_skips_when_recently_scanned() {
    let tmp = tempfile::tempdir().unwrap();
    let db = make_db(tmp.path());
    let cancel = Arc::new(AtomicBool::new(false));
    write_fake_audio(tmp.path(), "a.mp3");
    {
        let c = lock_shared(&db).unwrap();
        crate::library::add_folder(&c, &tmp.path().to_string_lossy()).unwrap();
    }

    // First rescan walks the folder and stamps last_scan_timestamp.
    let first = background_rescan_all_folders(&db, &cancel, None).unwrap();
    assert_eq!(first.total_scanned, 1);

    // A file added right after must NOT be picked up by an immediate
    // second rescan — the freshness gate skips the walk entirely.
    write_fake_audio(tmp.path(), "b.mp3");
    let second = background_rescan_all_folders(&db, &cancel, None).unwrap();
    assert_eq!(second.total_scanned, 0);
    assert_eq!(second.changed, 0);

    // Expiring the timestamp re-enables the scan.
    {
        let c = lock_shared(&db).unwrap();
        let stale = now_epoch() - BACKGROUND_RESCAN_MIN_INTERVAL_SECS - 1;
        crate::library::set_setting(&c, "last_scan_timestamp", &stale.to_string()).unwrap();
    }
    let third = background_rescan_all_folders(&db, &cancel, None).unwrap();
    assert_eq!(third.total_scanned, 2);
    assert_eq!(third.changed, 1);
}

#[test]
fn manual_rescan_stamps_freshness_timestamp() {
    let tmp = tempfile::tempdir().unwrap();
    let db = make_db(tmp.path());

    // A fresh DB has no timestamp; stamping makes the gate report fresh.
    {
        let c = lock_shared(&db).unwrap();
        assert!(!last_scan_is_fresh(&c));
    }
    stamp_last_scan(&db).unwrap();
    {
        let c = lock_shared(&db).unwrap();
        assert!(last_scan_is_fresh(&c));
    }
}

#[test]
fn nfc_dedup_runs_once_then_is_flag_gated() {
    let tmp = tempfile::tempdir().unwrap();
    let db = make_db(tmp.path());
    let c = lock_shared(&db).unwrap();

    // init_db already ran the migration on this fresh DB.
    assert_eq!(
        crate::library::get_setting(&c, "nfc_dedup_done").as_deref(),
        Some("1")
    );

    let insert = |p: &str| {
        c.execute(
            "INSERT INTO tracks (file_path, file_name, folder_path, format) VALUES (?1, ?2, ?3, ?4)",
            params![p, "álbum.mp3", "/music", "mp3"],
        )
        .unwrap();
    };

    // Re-arm the migration and plant an NFD duplicate: the run must clean it.
    crate::library::delete_setting(&c, "nfc_dedup_done").unwrap();
    let nfc = "/music/álbum.mp3".to_string();
    let nfd: String = nfc.chars().nfd().collect();
    insert(&nfc);
    insert(&nfd);
    assert_eq!(run_nfc_dedup_once(&c).unwrap(), 1);
    assert_eq!(
        crate::library::get_setting(&c, "nfc_dedup_done").as_deref(),
        Some("1")
    );

    // Plant another duplicate — the flag-gated call must skip it.
    let nfc2 = "/music/canción.mp3".to_string();
    let nfd2: String = nfc2.chars().nfd().collect();
    insert(&nfc2);
    insert(&nfd2);
    assert_eq!(run_nfc_dedup_once(&c).unwrap(), 0);
}
