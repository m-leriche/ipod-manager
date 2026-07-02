use crate::files::compare_dirs;
use crate::files::copy::{fmt_bytes, is_no_space, verify_copy_size};
use crate::files::{create_folder, list_dir, rename_entry};
use std::io;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

// ── Existing unit tests ──────────────────────────────────────────

#[test]
fn fmt_bytes_zero() {
    assert_eq!(fmt_bytes(0), "0 B");
}

#[test]
fn fmt_bytes_bytes() {
    assert_eq!(fmt_bytes(512), "512 B");
}

#[test]
fn fmt_bytes_kilobytes() {
    assert_eq!(fmt_bytes(1024), "1.0 KB");
    assert_eq!(fmt_bytes(1536), "1.5 KB");
}

#[test]
fn fmt_bytes_megabytes() {
    assert_eq!(fmt_bytes(1048576), "1.0 MB");
    assert_eq!(fmt_bytes(1572864), "1.5 MB");
}

#[test]
fn fmt_bytes_gigabytes() {
    assert_eq!(fmt_bytes(1073741824), "1.00 GB");
    assert_eq!(fmt_bytes(2684354560), "2.50 GB");
}

#[test]
fn is_no_space_os_code_28() {
    let err = io::Error::from_raw_os_error(28);
    assert!(is_no_space(&err));
}

#[test]
fn is_no_space_message_match() {
    let err = io::Error::new(io::ErrorKind::Other, "No space left on device");
    assert!(is_no_space(&err));
}

#[test]
fn is_no_space_disk_full_message() {
    let err = io::Error::new(io::ErrorKind::Other, "Disk full");
    assert!(is_no_space(&err));
}

#[test]
fn is_no_space_unrelated_error() {
    let err = io::Error::new(io::ErrorKind::PermissionDenied, "Permission denied");
    assert!(!is_no_space(&err));
}

// ── verify_copy_size ─────────────────────────────────────────────

#[test]
fn verify_copy_size_accepts_equal_sizes() {
    let tmp = tempfile::tempdir().unwrap();
    let src = tmp.path().join("src.mp3");
    let dest = tmp.path().join("dest.mp3");
    std::fs::write(&src, "audio").unwrap();
    std::fs::write(&dest, "audio").unwrap();

    assert!(verify_copy_size(&src, &dest).is_ok());
}

#[test]
fn verify_copy_size_rejects_truncated_destination() {
    let tmp = tempfile::tempdir().unwrap();
    let src = tmp.path().join("src.mp3");
    let dest = tmp.path().join("dest.mp3");
    std::fs::write(&src, "full audio data").unwrap();
    std::fs::write(&dest, "full").unwrap();

    let err = verify_copy_size(&src, &dest).unwrap_err();
    assert!(err.contains("size mismatch"));
}

#[test]
fn verify_copy_size_rejects_missing_destination() {
    let tmp = tempfile::tempdir().unwrap();
    let src = tmp.path().join("src.mp3");
    std::fs::write(&src, "audio").unwrap();

    let err = verify_copy_size(&src, &tmp.path().join("missing.mp3")).unwrap_err();
    assert!(err.contains("stat destination failed"));
}

// ── Security: Path traversal & listing ───────────────────────────

#[test]
fn list_dir_rejects_nonexistent_path() {
    let result = list_dir("/tmp/this_path_does_not_exist_12345");
    assert!(result.is_err());
}

#[test]
fn list_dir_canonicalizes_path_traversal() {
    // Create a temp dir and list it via a traversal path
    let tmp = tempfile::tempdir().unwrap();
    let inner = tmp.path().join("inner");
    std::fs::create_dir(&inner).unwrap();
    std::fs::write(inner.join("file.txt"), "hello").unwrap();

    // Access inner via parent/inner/../inner (canonicalize should resolve this)
    let traversal_path = format!("{}/inner/../inner", tmp.path().display());
    let result = list_dir(&traversal_path);
    assert!(result.is_ok());
    let entries = result.unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].name, "file.txt");
}

#[test]
fn list_dir_hides_dotfiles() {
    let tmp = tempfile::tempdir().unwrap();
    std::fs::write(tmp.path().join(".hidden"), "secret").unwrap();
    std::fs::write(tmp.path().join("visible.txt"), "public").unwrap();

    let entries = list_dir(tmp.path().to_str().unwrap()).unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].name, "visible.txt");
}

#[test]
fn list_dir_sorts_dirs_before_files() {
    let tmp = tempfile::tempdir().unwrap();
    std::fs::write(tmp.path().join("aaa.txt"), "file").unwrap();
    std::fs::create_dir(tmp.path().join("zzz_dir")).unwrap();

    let entries = list_dir(tmp.path().to_str().unwrap()).unwrap();
    assert_eq!(entries.len(), 2);
    assert!(entries[0].is_dir); // zzz_dir comes first despite alpha order
    assert!(!entries[1].is_dir); // aaa.txt
}

// ── Security: rename_entry ───────────────────────────────────────

#[test]
fn rename_entry_rejects_nonexistent_source() {
    let result = rename_entry("/tmp/no_such_file_xyz", "/tmp/new_name_xyz");
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("does not exist"));
}

#[test]
fn rename_entry_rejects_existing_destination() {
    let tmp = tempfile::tempdir().unwrap();
    let file_a = tmp.path().join("a.txt");
    let file_b = tmp.path().join("b.txt");
    std::fs::write(&file_a, "a").unwrap();
    std::fs::write(&file_b, "b").unwrap();

    let result = rename_entry(file_a.to_str().unwrap(), file_b.to_str().unwrap());
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("already exists"));
}

#[test]
fn rename_entry_succeeds_for_valid_rename() {
    let tmp = tempfile::tempdir().unwrap();
    let old = tmp.path().join("old.txt");
    let new = tmp.path().join("new.txt");
    std::fs::write(&old, "data").unwrap();

    let result = rename_entry(old.to_str().unwrap(), new.to_str().unwrap());
    assert!(result.is_ok());
    assert!(!old.exists());
    assert!(new.exists());
    assert_eq!(std::fs::read_to_string(&new).unwrap(), "data");
}

// ── Security: create_folder ──────────────────────────────────────

#[test]
fn create_folder_rejects_existing_path() {
    let tmp = tempfile::tempdir().unwrap();
    let result = create_folder(tmp.path().to_str().unwrap());
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("Already exists"));
}

#[test]
fn create_folder_rejects_missing_parent() {
    let result = create_folder("/tmp/no_such_parent_xyz/child_xyz");
    assert!(result.is_err());
    assert!(result
        .unwrap_err()
        .contains("Parent directory does not exist"));
}

#[test]
fn create_folder_succeeds() {
    let tmp = tempfile::tempdir().unwrap();
    let new_dir = tmp.path().join("new_subdir");
    let result = create_folder(new_dir.to_str().unwrap());
    assert!(result.is_ok());
    assert!(new_dir.is_dir());
}

// ── compare_dirs ────────────────────────────────────────────────

fn no_cancel() -> Arc<AtomicBool> {
    Arc::new(AtomicBool::new(false))
}

#[test]
fn compare_dirs_identical_directories() {
    let src = tempfile::tempdir().unwrap();
    let tgt = tempfile::tempdir().unwrap();

    std::fs::write(src.path().join("song.mp3"), "audio data").unwrap();
    std::fs::write(tgt.path().join("song.mp3"), "audio data").unwrap();

    let results = compare_dirs(
        src.path().to_str().unwrap(),
        tgt.path().to_str().unwrap(),
        no_cancel(),
    )
    .unwrap();

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].status, "same");
    assert_eq!(results[0].relative_path, "song.mp3");
}

#[test]
fn compare_dirs_source_only_file() {
    let src = tempfile::tempdir().unwrap();
    let tgt = tempfile::tempdir().unwrap();

    std::fs::write(src.path().join("new.flac"), "data").unwrap();

    let results = compare_dirs(
        src.path().to_str().unwrap(),
        tgt.path().to_str().unwrap(),
        no_cancel(),
    )
    .unwrap();

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].status, "source_only");
}

#[test]
fn compare_dirs_target_only_file() {
    let src = tempfile::tempdir().unwrap();
    let tgt = tempfile::tempdir().unwrap();

    std::fs::write(tgt.path().join("extra.mp3"), "data").unwrap();

    let results = compare_dirs(
        src.path().to_str().unwrap(),
        tgt.path().to_str().unwrap(),
        no_cancel(),
    )
    .unwrap();

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].status, "target_only");
}

#[test]
fn compare_dirs_modified_file() {
    let src = tempfile::tempdir().unwrap();
    let tgt = tempfile::tempdir().unwrap();

    std::fs::write(src.path().join("track.mp3"), "short").unwrap();
    std::fs::write(tgt.path().join("track.mp3"), "longer content").unwrap();

    let results = compare_dirs(
        src.path().to_str().unwrap(),
        tgt.path().to_str().unwrap(),
        no_cancel(),
    )
    .unwrap();

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].status, "modified");
    assert_ne!(results[0].source_size, results[0].target_size);
}

#[test]
fn compare_dirs_mixed_statuses_sorted_correctly() {
    let src = tempfile::tempdir().unwrap();
    let tgt = tempfile::tempdir().unwrap();

    // source_only
    std::fs::write(src.path().join("new.flac"), "new").unwrap();
    // same
    std::fs::write(src.path().join("shared.mp3"), "same").unwrap();
    std::fs::write(tgt.path().join("shared.mp3"), "same").unwrap();
    // modified
    std::fs::write(src.path().join("changed.mp3"), "v1").unwrap();
    std::fs::write(tgt.path().join("changed.mp3"), "version2").unwrap();
    // target_only
    std::fs::write(tgt.path().join("orphan.mp3"), "old").unwrap();

    let results = compare_dirs(
        src.path().to_str().unwrap(),
        tgt.path().to_str().unwrap(),
        no_cancel(),
    )
    .unwrap();

    assert_eq!(results.len(), 4);
    // Sort order: source_only, modified, target_only, same
    assert_eq!(results[0].status, "source_only");
    assert_eq!(results[1].status, "modified");
    assert_eq!(results[2].status, "target_only");
    assert_eq!(results[3].status, "same");
}

#[test]
fn compare_dirs_recursive_subdirectories() {
    let src = tempfile::tempdir().unwrap();
    let tgt = tempfile::tempdir().unwrap();

    std::fs::create_dir_all(src.path().join("Artist/Album")).unwrap();
    std::fs::create_dir_all(tgt.path().join("Artist/Album")).unwrap();
    std::fs::write(src.path().join("Artist/Album/01.mp3"), "data").unwrap();
    std::fs::write(tgt.path().join("Artist/Album/01.mp3"), "data").unwrap();

    let results = compare_dirs(
        src.path().to_str().unwrap(),
        tgt.path().to_str().unwrap(),
        no_cancel(),
    )
    .unwrap();

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].relative_path, "Artist/Album/01.mp3");
    assert_eq!(results[0].status, "same");
}

#[test]
fn compare_dirs_skips_dotfiles() {
    let src = tempfile::tempdir().unwrap();
    let tgt = tempfile::tempdir().unwrap();

    std::fs::write(src.path().join(".DS_Store"), "junk").unwrap();
    std::fs::write(src.path().join("track.mp3"), "audio").unwrap();
    std::fs::write(tgt.path().join("track.mp3"), "audio").unwrap();

    let results = compare_dirs(
        src.path().to_str().unwrap(),
        tgt.path().to_str().unwrap(),
        no_cancel(),
    )
    .unwrap();

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].relative_path, "track.mp3");
}

#[test]
fn compare_dirs_empty_directories() {
    let src = tempfile::tempdir().unwrap();
    let tgt = tempfile::tempdir().unwrap();

    let results = compare_dirs(
        src.path().to_str().unwrap(),
        tgt.path().to_str().unwrap(),
        no_cancel(),
    )
    .unwrap();

    assert!(results.is_empty());
}

#[test]
fn compare_dirs_cancellation() {
    let src = tempfile::tempdir().unwrap();
    let tgt = tempfile::tempdir().unwrap();

    std::fs::write(src.path().join("file.mp3"), "data").unwrap();

    let cancel = Arc::new(AtomicBool::new(true));
    let result = compare_dirs(
        src.path().to_str().unwrap(),
        tgt.path().to_str().unwrap(),
        cancel,
    );

    assert!(result.is_err());
    assert!(result.unwrap_err().contains("Cancelled"));
}

#[test]
fn compare_dirs_rejects_nonexistent_source() {
    let tgt = tempfile::tempdir().unwrap();
    let result = compare_dirs(
        "/tmp/nonexistent_dir_xyz_12345",
        tgt.path().to_str().unwrap(),
        no_cancel(),
    );
    assert!(result.is_err());
}

// ── Security: symlink handling ───────────────────────────────────

#[test]
fn list_dir_follows_symlink_in_path_via_canonicalize() {
    let tmp = tempfile::tempdir().unwrap();
    let real_dir = tmp.path().join("real");
    let link = tmp.path().join("link");
    std::fs::create_dir(&real_dir).unwrap();
    std::fs::write(real_dir.join("data.txt"), "hello").unwrap();

    #[cfg(unix)]
    std::os::unix::fs::symlink(&real_dir, &link).unwrap();

    #[cfg(unix)]
    {
        let result = list_dir(link.to_str().unwrap());
        assert!(result.is_ok());
        let entries = result.unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "data.txt");
    }
}
