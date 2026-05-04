use crate::files::copy::{fmt_bytes, is_no_space};
use crate::files::{create_folder, list_dir, rename_entry};
use std::io;

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
