use crate::files::copy::{fmt_bytes, is_no_space};
use std::io;

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
