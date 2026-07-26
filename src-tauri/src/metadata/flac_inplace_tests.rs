//! Tests for the in-place FLAC writer.
//!
//! The invariants that matter: the audio frames must come out byte-identical,
//! the file length must not change, and lofty must read back exactly what was
//! written (the fallback path writes through lofty, so the two must agree).

use super::*;
use lofty::config::WriteOptions;
use lofty::prelude::{Accessor, ItemKey, TagExt, TaggedFileExt};
use lofty::probe::Probe;
use std::path::PathBuf;

/// Build a minimal but valid FLAC: `fLaC`, a STREAMINFO block, a
/// VORBIS_COMMENT block, `padding` bytes of PADDING, then fake audio.
fn write_test_flac(path: &PathBuf, padding: usize, comments: &[(&str, &str)]) {
    let mut out = Vec::new();
    out.extend_from_slice(b"fLaC");

    // STREAMINFO: 34 bytes, describing a 44.1kHz stereo 16-bit stream.
    let mut streaminfo = vec![0u8; 34];
    streaminfo[0..2].copy_from_slice(&4096u16.to_be_bytes()); // min block size
    streaminfo[2..4].copy_from_slice(&4096u16.to_be_bytes()); // max block size
                                                              // sample rate 44100 (20 bits), channels-1 (3 bits), bps-1 (5 bits)
    streaminfo[10] = 0x0A;
    streaminfo[11] = 0xC4;
    streaminfo[12] = 0x42;
    streaminfo[13] = 0xF0;
    out.push(0); // not last, type 0 = STREAMINFO
    out.extend_from_slice(&(streaminfo.len() as u32).to_be_bytes()[1..]);
    out.extend_from_slice(&streaminfo);

    let vendor = "test-vendor";
    let mut comment = Vec::new();
    comment.extend_from_slice(&(vendor.len() as u32).to_le_bytes());
    comment.extend_from_slice(vendor.as_bytes());
    comment.extend_from_slice(&(comments.len() as u32).to_le_bytes());
    for (k, v) in comments {
        let entry = format!("{k}={v}");
        comment.extend_from_slice(&(entry.len() as u32).to_le_bytes());
        comment.extend_from_slice(entry.as_bytes());
    }
    out.push(4); // not last, type 4 = VORBIS_COMMENT
    out.extend_from_slice(&(comment.len() as u32).to_be_bytes()[1..]);
    out.extend_from_slice(&comment);

    out.push(0x80 | 1); // last block, type 1 = PADDING
    out.extend_from_slice(&(padding as u32).to_be_bytes()[1..]);
    out.extend_from_slice(&vec![0u8; padding]);

    out.extend_from_slice(&audio_marker());
    std::fs::write(path, out).expect("write test flac");
}

/// Stand-in for audio frames. Starts with a frame sync so it is never mistaken
/// for padding, and is long enough that a shift would be obvious.
fn audio_marker() -> Vec<u8> {
    let mut audio = vec![0xFF, 0xF8];
    audio.extend((0..512).map(|i| (i % 251) as u8));
    audio
}

/// Byte offset of the first audio frame, found by walking the block headers.
fn audio_offset(bytes: &[u8]) -> usize {
    let mut offset = 4;
    loop {
        let is_last = bytes[offset] & 0x80 != 0;
        let len = u32::from_be_bytes([0, bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]])
            as usize;
        offset += 4 + len;
        if is_last {
            return offset;
        }
    }
}

fn tag_with(items: &[(ItemKey, &str)]) -> Tag {
    let mut tag = Tag::new(TagType::VorbisComments);
    for (key, value) in items {
        tag.insert_text(key.clone(), (*value).to_string());
    }
    tag
}

#[test]
fn writes_in_place_without_moving_audio_or_changing_length() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("a.flac");
    write_test_flac(&path, 4096, &[("ARTIST", "Old Artist"), ("TITLE", "Song")]);

    let before = std::fs::read(&path).expect("read");
    let audio_start_before = audio_offset(&before);

    let tag = tag_with(&[
        (ItemKey::TrackArtist, "A Considerably Longer Artist Name"),
        (ItemKey::TrackTitle, "Song"),
    ]);
    assert!(write_in_place(&path, &tag).expect("write"));

    let after = std::fs::read(&path).expect("read back");
    assert_eq!(
        before.len(),
        after.len(),
        "in-place write must not change file length"
    );
    assert_eq!(
        audio_start_before,
        audio_offset(&after),
        "audio must not move"
    );
    assert_eq!(
        &before[audio_start_before..],
        &after[audio_start_before..],
        "audio frames must be byte-identical"
    );
}

#[test]
fn lofty_reads_back_what_was_written() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("b.flac");
    write_test_flac(&path, 4096, &[("ARTIST", "Old")]);

    let tag = tag_with(&[
        (ItemKey::TrackArtist, "New Artist"),
        (ItemKey::AlbumTitle, "New Album"),
        (ItemKey::TrackTitle, "New Title"),
        (ItemKey::Genre, "Shoegaze"),
        (ItemKey::TrackNumber, "7"),
        (ItemKey::AlbumArtist, "New Album Artist"),
        (ItemKey::TrackArtistSortOrder, "Artist, New"),
    ]);
    assert!(write_in_place(&path, &tag).expect("write"));

    let read = Probe::open(&path)
        .expect("probe")
        .read()
        .expect("read")
        .primary_tag()
        .cloned()
        .expect("tag");

    assert_eq!(read.artist().as_deref(), Some("New Artist"));
    assert_eq!(read.album().as_deref(), Some("New Album"));
    assert_eq!(read.title().as_deref(), Some("New Title"));
    assert_eq!(read.genre().as_deref(), Some("Shoegaze"));
    assert_eq!(read.track(), Some(7));
    assert_eq!(
        read.get_string(&ItemKey::AlbumArtist),
        Some("New Album Artist")
    );
    assert_eq!(
        read.get_string(&ItemKey::TrackArtistSortOrder),
        Some("Artist, New")
    );
}

/// The vendor string is metadata about the encoder, not the tags. lofty's own
/// writer preserves it; so must we, or every save would silently erase it.
#[test]
fn preserves_the_existing_vendor_string() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("c.flac");
    write_test_flac(&path, 2048, &[("ARTIST", "Old")]);

    assert!(write_in_place(&path, &tag_with(&[(ItemKey::TrackArtist, "New")])).expect("write"));

    let bytes = std::fs::read(&path).expect("read");
    assert!(
        find_subslice(&bytes, b"test-vendor").is_some(),
        "vendor string must survive the rewrite"
    );
}

/// Tags too big for the region must be reported as such, not written partially.
#[test]
fn declines_when_the_tags_do_not_fit_the_region() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("d.flac");
    write_test_flac(&path, 0, &[("ARTIST", "Old")]);

    let before = std::fs::read(&path).expect("read");
    let huge = "x".repeat(4096);
    let fits = write_in_place(&path, &tag_with(&[(ItemKey::TrackArtist, &huge)])).expect("write");

    assert!(!fits, "must decline rather than move audio");
    assert_eq!(
        before,
        std::fs::read(&path).expect("read back"),
        "a declined write must leave the file untouched"
    );
}

/// Non-FLAC input must be declined, not corrupted.
#[test]
fn declines_non_flac_files() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("e.mp3");
    std::fs::write(&path, b"ID3\x03\x00\x00\x00\x00\x00\x00padding").expect("write");
    let before = std::fs::read(&path).expect("read");

    assert!(!write_in_place(&path, &tag_with(&[(ItemKey::TrackArtist, "X")])).expect("write"));
    assert_eq!(before, std::fs::read(&path).expect("read back"));
}

/// PICTURE blocks are re-emitted verbatim, so embedded art survives a tag edit.
#[test]
fn preserves_picture_blocks() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("f.flac");

    // Hand-build a FLAC with STREAMINFO, VORBIS_COMMENT, PICTURE, PADDING.
    let mut out = Vec::new();
    out.extend_from_slice(b"fLaC");
    out.push(0);
    out.extend_from_slice(&34u32.to_be_bytes()[1..]);
    out.extend_from_slice(&[0u8; 34]);

    let vendor = "v";
    let mut comment = Vec::new();
    comment.extend_from_slice(&(vendor.len() as u32).to_le_bytes());
    comment.extend_from_slice(vendor.as_bytes());
    comment.extend_from_slice(&0u32.to_le_bytes());
    out.push(4);
    out.extend_from_slice(&(comment.len() as u32).to_be_bytes()[1..]);
    out.extend_from_slice(&comment);

    let picture: Vec<u8> = (0..300).map(|i| (i % 97) as u8 | 0x80).collect();
    out.push(6); // PICTURE
    out.extend_from_slice(&(picture.len() as u32).to_be_bytes()[1..]);
    out.extend_from_slice(&picture);

    out.push(0x80 | 1);
    out.extend_from_slice(&2048u32.to_be_bytes()[1..]);
    out.extend_from_slice(&[0u8; 2048]);
    out.extend_from_slice(&audio_marker());
    std::fs::write(&path, &out).expect("write");

    assert!(write_in_place(&path, &tag_with(&[(ItemKey::TrackArtist, "New")])).expect("write"));

    let after = std::fs::read(&path).expect("read");
    assert!(
        find_subslice(&after, &picture).is_some(),
        "PICTURE block must survive verbatim"
    );
    assert_eq!(out.len(), after.len());
}

/// A file whose comment block already fills the region exactly (no padding) is
/// still writable in place when the new tags happen to be the same size.
#[test]
fn handles_an_exact_fit_with_no_padding_block() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("g.flac");
    write_test_flac(&path, 0, &[("ARTIST", "abc")]);

    // Same key, same length value: the new block is byte-for-byte the same size.
    assert!(write_in_place(&path, &tag_with(&[(ItemKey::TrackArtist, "xyz")])).expect("write"));

    let read = Probe::open(&path)
        .expect("probe")
        .read()
        .expect("read")
        .primary_tag()
        .cloned()
        .expect("tag");
    assert_eq!(read.artist().as_deref(), Some("xyz"));
}

/// The whole point of the module: a file lofty would fully rewrite must come
/// out of our path with identical tag content. Guards against the two writers
/// drifting apart.
#[test]
fn agrees_with_the_lofty_fallback() {
    let dir = tempfile::tempdir().expect("tempdir");
    let ours = dir.path().join("ours.flac");
    let theirs = dir.path().join("theirs.flac");
    write_test_flac(&ours, 4096, &[("ARTIST", "Old")]);
    std::fs::copy(&ours, &theirs).expect("copy");

    let tag = tag_with(&[
        (ItemKey::TrackArtist, "Same Artist"),
        (ItemKey::AlbumTitle, "Same Album"),
        (ItemKey::TrackNumber, "3"),
        (ItemKey::Genre, "Ambient"),
    ]);

    assert!(write_in_place(&ours, &tag).expect("write"));
    tag.save_to_path(&theirs, WriteOptions::default())
        .expect("lofty write");

    let read = |p: &PathBuf| {
        let t = Probe::open(p)
            .expect("probe")
            .read()
            .expect("read")
            .primary_tag()
            .cloned()
            .expect("tag");
        let mut items: Vec<String> = t
            .items()
            .filter_map(|i| match i.value() {
                ItemValue::Text(v) => i
                    .key()
                    .map_key(TagType::VorbisComments, true)
                    .map(|k| format!("{k}={v}")),
                _ => None,
            })
            .collect();
        items.sort();
        items
    };

    assert_eq!(read(&ours), read(&theirs));
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}
