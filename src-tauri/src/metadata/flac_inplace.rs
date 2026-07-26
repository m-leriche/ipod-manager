//! In-place FLAC tag writing.
//!
//! lofty rewrites the entire FLAC stream to change one tag — it reads
//! everything after STREAMINFO into memory, splices the new comment block in,
//! truncates and writes it all back. Its own source carries the reason:
//! `// TODO: We need to actually use padding` (lofty-rs#445, still open). A
//! one-byte artist edit therefore costs a full read + write of the file, which
//! measured ~86ms for a 58MB FLAC on a USB drive.
//!
//! FLAC's format exists to avoid exactly that: a PADDING block sits in the
//! metadata region so tags can grow or shrink without moving audio. This module
//! rewrites only that region, keeping its byte length identical, so the audio
//! frames are never touched and the write is a few KB.
//!
//! Blocks other than VORBIS_COMMENT and PADDING are re-emitted byte-for-byte,
//! so embedded art (PICTURE) and seek tables survive untouched. Since the whole
//! region is rewritten, a file with large embedded art costs that region's size
//! rather than the audio's — still bounded by `MAX_REGION_LEN`, far below the
//! stream itself.
//!
//! Art stored *inside* the comment block instead (`METADATA_BLOCK_PICTURE`, or
//! the deprecated `COVERART`) is the one thing this can't carry: lofty parses
//! those entries into `Tag::pictures`, so they arrive here as neither text items
//! nor a preserved block. Those files fall back to the full rewrite.

use lofty::tag::{ItemValue, Tag, TagType};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::Path;

const BLOCK_HEADER_LEN: usize = 4;
const STREAM_MARKER: &[u8; 4] = b"fLaC";
const BLOCK_TYPE_VORBIS_COMMENT: u8 = 4;
const BLOCK_TYPE_PADDING: u8 = 1;
/// A single FLAC metadata block maxes out at 2^24-1 bytes. Refuse to buffer a
/// pathological region rather than allocating unbounded; the caller falls back
/// to lofty, which reads the whole file anyway.
const MAX_REGION_LEN: usize = 8 * 1024 * 1024;

struct MetaBlock {
    block_type: u8,
    /// Block payload, excluding the 4-byte header.
    data: Vec<u8>,
}

/// Write `tag`'s text items into `path`'s VORBIS_COMMENT block without moving
/// the audio frames.
///
/// Returns `Ok(false)` when the file isn't a FLAC we can rewrite in place, or
/// when the new tags don't fit the existing metadata region — the caller must
/// then fall back to a full rewrite. Returns `Err` only when the file was
/// readable but writing failed.
pub(super) fn write_in_place(path: &Path, tag: &Tag) -> Result<bool, String> {
    let mut file = File::options()
        .read(true)
        .write(true)
        .open(path)
        .map_err(|e| format!("Open failed: {e}"))?;

    let Some((blocks, region_len)) = read_metadata_region(&mut file)? else {
        return Ok(false);
    };

    let existing_comments = blocks
        .iter()
        .find(|b| b.block_type == BLOCK_TYPE_VORBIS_COMMENT);

    // Some encoders store cover art as a comment entry rather than a PICTURE
    // block. lofty parses those into `tag.pictures`, so they reach us as
    // neither text items nor a block we preserve — rebuilding the comment list
    // would silently drop the art (and the smaller block would fit, so the
    // write would succeed). Hand those files to the full rewrite, which keeps
    // them.
    if existing_comments
        .map(|b| has_embedded_picture(&b.data))
        .unwrap_or(false)
    {
        return Ok(false);
    }

    let vendor = existing_comments
        .and_then(|b| parse_vendor(&b.data))
        .unwrap_or_default();

    let comment_block = build_comment_block(&vendor, tag);

    let Some(region) = assemble_region(&blocks, comment_block, region_len) else {
        return Ok(false);
    };
    debug_assert_eq!(region.len(), region_len);

    file.seek(SeekFrom::Start(STREAM_MARKER.len() as u64))
        .map_err(|e| format!("Seek failed: {e}"))?;
    file.write_all(&region)
        .map_err(|e| format!("Write failed: {e}"))?;
    file.flush().map_err(|e| format!("Flush failed: {e}"))?;

    Ok(true)
}

/// Read every metadata block, returning them in file order alongside the byte
/// length of the region they occupy (everything between the `fLaC` marker and
/// the first audio frame).
///
/// `Ok(None)` means "not an in-place candidate" — not a FLAC, no blocks, or a
/// region too large to buffer.
type MetadataRegion = Option<(Vec<MetaBlock>, usize)>;

fn read_metadata_region(file: &mut File) -> Result<MetadataRegion, String> {
    let mut marker = [0u8; 4];
    if file.read_exact(&mut marker).is_err() || &marker != STREAM_MARKER {
        return Ok(None);
    }

    let mut blocks = Vec::new();
    let mut region_len = 0usize;

    loop {
        let mut header = [0u8; BLOCK_HEADER_LEN];
        if file.read_exact(&mut header).is_err() {
            return Ok(None);
        }
        let is_last = header[0] & 0x80 != 0;
        let block_type = header[0] & 0x7f;
        let data_len = u32::from_be_bytes([0, header[1], header[2], header[3]]) as usize;

        region_len += BLOCK_HEADER_LEN + data_len;
        if region_len > MAX_REGION_LEN {
            return Ok(None);
        }

        let mut data = vec![0u8; data_len];
        if file.read_exact(&mut data).is_err() {
            return Ok(None);
        }
        blocks.push(MetaBlock { block_type, data });

        if is_last {
            break;
        }
    }

    if blocks.is_empty() {
        return Ok(None);
    }
    Ok(Some((blocks, region_len)))
}

/// Re-emit the metadata region with the new comment block in place of the old
/// one, sizing a trailing PADDING block so the region's total length is
/// unchanged. Returns `None` when the new tags don't fit.
fn assemble_region(
    blocks: &[MetaBlock],
    comment_block: Vec<u8>,
    region_len: usize,
) -> Option<Vec<u8>> {
    let mut out: Vec<u8> = Vec::with_capacity(region_len);
    let mut comment_written = false;

    for block in blocks {
        match block.block_type {
            BLOCK_TYPE_VORBIS_COMMENT => {
                // Replace the first comment block; drop any duplicates.
                if !comment_written {
                    push_block(&mut out, BLOCK_TYPE_VORBIS_COMMENT, &comment_block)?;
                    comment_written = true;
                }
            }
            // Padding is re-created at the end, sized to fill the region.
            BLOCK_TYPE_PADDING => {}
            _ => push_block(&mut out, block.block_type, &block.data)?,
        }
    }

    // A file with no comment block yet gets one appended after the real blocks.
    if !comment_written {
        push_block(&mut out, BLOCK_TYPE_VORBIS_COMMENT, &comment_block)?;
    }

    match region_len.checked_sub(out.len()) {
        // Exact fit: the last real block terminates the region.
        Some(0) => {}
        // Enough slack for a padding block's header plus its (possibly empty) body.
        Some(slack) if slack >= BLOCK_HEADER_LEN => {
            let padding = vec![0u8; slack - BLOCK_HEADER_LEN];
            push_block(&mut out, BLOCK_TYPE_PADDING, &padding)?;
        }
        // Either the tags overflow the region, or the 1-3 bytes left over can't
        // hold a block header. Both mean the audio would have to move.
        _ => return None,
    }

    set_last_block_flag(&mut out)?;
    Some(out)
}

/// Mark the final emitted block as last, and clear the flag everywhere else.
/// Walks the emitted bytes rather than tracking offsets during assembly so the
/// flag can never disagree with what was actually written.
fn set_last_block_flag(out: &mut [u8]) -> Option<()> {
    let mut offset = 0usize;
    let mut last_header = None;
    while offset + BLOCK_HEADER_LEN <= out.len() {
        out[offset] &= 0x7f;
        last_header = Some(offset);
        let data_len =
            u32::from_be_bytes([0, out[offset + 1], out[offset + 2], out[offset + 3]]) as usize;
        offset += BLOCK_HEADER_LEN + data_len;
    }
    // Offsets must land exactly on the region end; anything else means the
    // headers we just wrote don't describe the buffer.
    if offset != out.len() {
        return None;
    }
    out[last_header?] |= 0x80;
    Some(())
}

fn push_block(out: &mut Vec<u8>, block_type: u8, data: &[u8]) -> Option<()> {
    let len = u32::try_from(data.len()).ok()?;
    if len > 0x00ff_ffff {
        return None;
    }
    out.push(block_type & 0x7f);
    out.extend_from_slice(&len.to_be_bytes()[1..]);
    out.extend_from_slice(data);
    Some(())
}

/// Read the vendor string from a VORBIS_COMMENT block body so it can be carried
/// over unchanged, matching what lofty's own writer does.
fn parse_vendor(data: &[u8]) -> Option<String> {
    let len_bytes = data.get(..4)?;
    let vendor_len = u32::from_le_bytes(len_bytes.try_into().ok()?) as usize;
    let vendor = data.get(4..4 + vendor_len)?;
    String::from_utf8(vendor.to_vec()).ok()
}

/// Keys whose values are cover art rather than text. lofty reads these into
/// `Tag::pictures` instead of the item list, so a rebuilt comment block would
/// lose them.
const PICTURE_COMMENT_KEYS: &[&[u8]] = &[b"METADATA_BLOCK_PICTURE", b"COVERART"];

/// Whether a VORBIS_COMMENT block body carries art in one of its entries.
fn has_embedded_picture(data: &[u8]) -> bool {
    for entry in comment_entries(data) {
        let key = match entry.iter().position(|b| *b == b'=') {
            Some(eq) => &entry[..eq],
            // No separator: lofty discards the field, and so can we.
            None => continue,
        };
        if PICTURE_COMMENT_KEYS
            .iter()
            .any(|k| k.eq_ignore_ascii_case(key))
        {
            return true;
        }
    }
    false
}

/// Iterate the raw `KEY=value` entries of a VORBIS_COMMENT block body.
///
/// Stops at the first malformed length rather than guessing, so a truncated
/// block simply yields fewer entries; callers treat that conservatively.
fn comment_entries(data: &[u8]) -> Vec<&[u8]> {
    let read_u32 = |at: usize| -> Option<usize> {
        let bytes = data.get(at..at + 4)?;
        Some(u32::from_le_bytes(bytes.try_into().ok()?) as usize)
    };

    let Some(vendor_len) = read_u32(0) else {
        return Vec::new();
    };
    let mut offset = match 4usize.checked_add(vendor_len) {
        Some(o) => o,
        None => return Vec::new(),
    };
    let Some(count) = read_u32(offset) else {
        return Vec::new();
    };
    offset += 4;

    let mut entries = Vec::new();
    for _ in 0..count {
        let Some(len) = read_u32(offset) else { break };
        offset += 4;
        let Some(entry) = data.get(offset..offset.saturating_add(len)) else {
            break;
        };
        entries.push(entry);
        offset += len;
    }
    entries
}

/// Serialize a VORBIS_COMMENT block body: vendor string, then a length-prefixed
/// `KEY=value` list, all little-endian.
///
/// Keys come from lofty's own `ItemKey` mapping so a file written here reads
/// back identically to one written by the lofty fallback. Pictures are
/// deliberately excluded: in FLAC they belong in PICTURE blocks, which this
/// module preserves verbatim, and inlining them as `METADATA_BLOCK_PICTURE`
/// comments (what lofty's `dump_to` would do) would both duplicate the art and
/// blow past the region.
fn build_comment_block(vendor: &str, tag: &Tag) -> Vec<u8> {
    let mut items: Vec<(&str, &str)> = Vec::new();
    for item in tag.items() {
        let value = match item.value() {
            ItemValue::Text(v) | ItemValue::Locator(v) => v.as_str(),
            _ => continue,
        };
        if let Some(key) = item.key().map_key(TagType::VorbisComments, true) {
            items.push((key, value));
        }
    }

    let mut out = Vec::new();
    out.extend_from_slice(&(vendor.len() as u32).to_le_bytes());
    out.extend_from_slice(vendor.as_bytes());
    out.extend_from_slice(&(items.len() as u32).to_le_bytes());
    for (key, value) in items {
        let entry = format!("{key}={value}");
        out.extend_from_slice(&(entry.len() as u32).to_le_bytes());
        out.extend_from_slice(entry.as_bytes());
    }
    out
}

#[cfg(test)]
#[path = "flac_inplace_tests.rs"]
mod tests;
