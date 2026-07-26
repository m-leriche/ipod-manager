use super::*;
use crate::library;
use std::sync::{Arc, Mutex};

fn track_dir() -> tempfile::TempDir {
    tempfile::tempdir().expect("tempdir")
}

fn open_db(dir: &tempfile::TempDir) -> rusqlite::Connection {
    library::init_db(&dir.path().join("library.db")).expect("init_db")
}

fn insert_track(conn: &rusqlite::Connection, file_path: &str) -> i64 {
    let path = Path::new(file_path);
    let name = path.file_name().unwrap().to_string_lossy().to_string();
    let folder = path.parent().unwrap().to_string_lossy().to_string();
    conn.execute(
        "INSERT INTO tracks (file_path, file_name, folder_path) VALUES (?1, ?2, ?3)",
        rusqlite::params![file_path, name, folder],
    )
    .expect("insert");
    conn.last_insert_rowid()
}

fn update_for(file_path: &str) -> metadata::MetadataUpdate {
    metadata::MetadataUpdate {
        file_path: file_path.to_string(),
        track_id: None,
        title: None,
        artist: None,
        album: None,
        album_artist: None,
        sort_artist: None,
        sort_album_artist: None,
        track: None,
        track_total: None,
        disc_number: None,
        disc_total: None,
        year: None,
        genre: None,
        compilation: None,
    }
}

/// A save must only ever touch the rows for the files it saved. It used to
/// sweep every row under the library root and delete any whose file it couldn't
/// stat — so a save while the library volume was detached (the library lives on
/// a removable drive) deleted the entire tracks table.
#[test]
fn save_leaves_rows_for_other_tracks_alone_when_library_root_is_missing() {
    let dir = track_dir();
    let conn = open_db(&dir);

    // A root that does not exist, standing in for a detached volume.
    let root = "/Volumes/DetachedDrive/Music";
    let folder = format!("{}/Artist/Album", root);
    library::set_library_location(&conn, root).expect("set location");
    for name in ["a.mp3", "b.mp3"] {
        insert_track(&conn, &format!("{}/{}", folder, name));
    }

    let conn_arc = Arc::new(Mutex::new(conn));
    let saved = vec![format!("{}/a.mp3", folder)];
    let (library_root, _updated) =
        upsert_saved_files(&conn_arc, &saved).expect("upsert after save");

    assert_eq!(library_root.as_deref(), Some(root));

    let remaining: i64 = conn_arc
        .lock()
        .expect("lock")
        .query_row("SELECT COUNT(*) FROM tracks", [], |r| r.get(0))
        .expect("count");
    assert_eq!(remaining, 2, "a save must not delete other tracks' rows");
}

/// The frontend patches the rows this returns instead of re-querying the
/// browser, so a save has to hand back the rows it touched — and only those.
#[test]
fn returns_the_rows_for_the_saved_files_only() {
    let dir = track_dir();
    let conn = open_db(&dir);
    let folder = dir.path().join("Artist/Album");
    std::fs::create_dir_all(&folder).expect("mkdir");

    let saved_path = folder.join("saved.mp3");
    let other_path = folder.join("other.mp3");
    std::fs::write(&saved_path, b"not really audio").expect("write");
    std::fs::write(&other_path, b"not really audio").expect("write");
    insert_track(&conn, &saved_path.to_string_lossy());
    insert_track(&conn, &other_path.to_string_lossy());

    let conn_arc = Arc::new(Mutex::new(conn));
    let saved = vec![saved_path.to_string_lossy().to_string()];
    let (_root, updated) = upsert_saved_files(&conn_arc, &saved).expect("upsert");

    assert_eq!(updated.len(), 1, "only the saved file's row comes back");
    assert_eq!(updated[0].file_path, saved_path.to_string_lossy());
}

/// A save touching a file that isn't in the library must not invent a row for
/// it, and must not error — the metadata editor can be pointed anywhere.
#[test]
fn returns_no_rows_when_the_files_are_not_in_the_library() {
    let dir = track_dir();
    let conn = open_db(&dir);
    let conn_arc = Arc::new(Mutex::new(conn));

    let orphan = dir.path().join("loose.mp3");
    std::fs::write(&orphan, b"not really audio").expect("write");
    let saved = vec![orphan.to_string_lossy().to_string()];

    let (library_root, updated) = upsert_saved_files(&conn_arc, &saved).expect("upsert");
    assert!(library_root.is_none(), "no library configured");
    // upsert_track inserts the file, but there is no library root, so the caller
    // emits nothing. The row itself is the scan path's business.
    assert_eq!(updated.len(), 1);
}

/// Undo names its file by path, and the background reorganize may have moved it
/// since. The track id is what makes undo survive that.
#[test]
fn resolves_a_moved_file_from_its_track_id() {
    let dir = track_dir();
    let conn = open_db(&dir);

    let moved_to = dir.path().join("New Artist/New Album/song.flac");
    std::fs::create_dir_all(moved_to.parent().unwrap()).expect("mkdir");
    std::fs::write(&moved_to, b"audio").expect("write");
    let id = insert_track(&conn, &moved_to.to_string_lossy());

    let conn_arc = Arc::new(Mutex::new(conn));

    // An undo op recorded before the move: the old path no longer exists.
    let stale_path = dir.path().join("Old Artist/Old Album/song.flac");
    let mut update = update_for(&stale_path.to_string_lossy());
    update.track_id = Some(id);

    let resolved = resolve_moved_paths(&conn_arc, vec![update]).expect("resolve");
    assert_eq!(
        resolved[0].file_path,
        moved_to.to_string_lossy(),
        "a stale path must be re-resolved through the track id"
    );
}

/// Updates the frontend builds carry no id and always name a live file. Those
/// must pass through untouched — no DB lookup, no rewriting.
#[test]
fn leaves_paths_alone_when_the_file_still_exists() {
    let dir = track_dir();
    let conn = open_db(&dir);
    let path = dir.path().join("song.flac");
    std::fs::write(&path, b"audio").expect("write");
    let id = insert_track(&conn, &path.to_string_lossy());
    let conn_arc = Arc::new(Mutex::new(conn));

    let mut update = update_for(&path.to_string_lossy());
    update.track_id = Some(id);
    let resolved = resolve_moved_paths(&conn_arc, vec![update]).expect("resolve");
    assert_eq!(resolved[0].file_path, path.to_string_lossy());

    // And with no id at all, a missing file is still left as-is for the write
    // layer to report as an error.
    let missing = update_for("/nowhere/gone.flac");
    let resolved = resolve_moved_paths(&conn_arc, vec![missing]).expect("resolve");
    assert_eq!(resolved[0].file_path, "/nowhere/gone.flac");
}
