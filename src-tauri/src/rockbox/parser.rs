use std::collections::HashMap;

pub(super) const MAGIC_V10: i32 = 0x5443_4810;
pub(super) const MAGIC_V0F: i32 = 0x5443_480F;
pub(super) const HEADER_SIZE: usize = 24;
pub(super) const TAG_HEADER_SIZE: usize = 12;
pub(super) const FLAG_DELETED: i32 = 0x0001;

// ── Internal Types ──────────────────────────────────────────────

pub(super) struct MasterHeader {
    pub(super) entry_count: i32,
    pub(super) serial: i32,
}

pub(super) struct IndexEntry {
    pub(super) tag_offsets: Vec<i32>,
    pub(super) year: i32,
    pub(super) track_number: i32,
    pub(super) bitrate: i32,
    pub(super) length: i32,
    pub(super) playcount: i32,
    pub(super) rating: i32,
    pub(super) playtime: i32,
    pub(super) lastplayed: i32,
    pub(super) flags: i32,
}

#[derive(Clone, Copy)]
pub(super) enum DbVersion {
    V0F,
    V10,
}

impl DbVersion {
    pub(super) fn entry_size(self) -> usize {
        match self {
            DbVersion::V0F => 92,
            DbVersion::V10 => 96,
        }
    }

    fn numeric_offset(self) -> usize {
        // Byte offset within an entry where numeric fields start (after string tag offsets)
        match self {
            DbVersion::V0F => 9 * 4, // 36
            DbVersion::V10 => 9 * 4, // 36 — first 9 string tags, then year starts
        }
    }
}

// ── Parsing Helpers ─────────────────────────────────────────────

pub(super) fn read_i32_le(data: &[u8], offset: usize) -> i32 {
    i32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ])
}

pub(super) fn detect_version(magic: i32) -> Result<DbVersion, String> {
    match magic {
        MAGIC_V10 => Ok(DbVersion::V10),
        MAGIC_V0F => Ok(DbVersion::V0F),
        _ => Err(format!(
            "Unknown TagCache version: 0x{:08X}. Expected 0x{:08X} (v16) or 0x{:08X} (v15)",
            magic, MAGIC_V10, MAGIC_V0F
        )),
    }
}

pub(super) fn parse_master_header(data: &[u8]) -> Result<(DbVersion, MasterHeader), String> {
    if data.len() < HEADER_SIZE {
        return Err("Master index file too small for header".to_string());
    }

    let magic = read_i32_le(data, 0);
    let version = detect_version(magic)?;
    let entry_count = read_i32_le(data, 8);
    let serial = read_i32_le(data, 12);

    if entry_count < 0 {
        return Err(format!("Invalid entry count: {}", entry_count));
    }

    Ok((
        version,
        MasterHeader {
            entry_count,
            serial,
        },
    ))
}

pub(super) fn parse_index_entry(
    data: &[u8],
    offset: usize,
    version: DbVersion,
) -> Option<IndexEntry> {
    let entry_size = version.entry_size();
    if offset + entry_size > data.len() {
        return None;
    }

    let entry = &data[offset..offset + entry_size];

    // Read string tag offsets (first 9 i32 values for both versions)
    let mut tag_offsets: Vec<i32> = (0..9).map(|i| read_i32_le(entry, i * 4)).collect();

    // After the 9 string tag offsets, numeric fields follow
    let num_base = version.numeric_offset();

    let year = read_i32_le(entry, num_base);
    let _disc_number = read_i32_le(entry, num_base + 4);
    let track_number = read_i32_le(entry, num_base + 8);

    // V10 has canonical_artist offset at num_base + 12, shifting numerics by 4
    let extra = match version {
        DbVersion::V10 => {
            let canonical = read_i32_le(entry, num_base + 12);
            tag_offsets.push(canonical);
            4
        }
        DbVersion::V0F => 0,
    };

    let bitrate = read_i32_le(entry, num_base + 12 + extra);
    let length = read_i32_le(entry, num_base + 16 + extra);
    let playcount = read_i32_le(entry, num_base + 20 + extra);
    let rating = read_i32_le(entry, num_base + 24 + extra);
    let playtime = read_i32_le(entry, num_base + 28 + extra);
    let lastplayed = read_i32_le(entry, num_base + 32 + extra);
    // commitid, mtime, lastelapsed, lastoffset — skipped
    let flags = read_i32_le(entry, entry_size - 4);

    Some(IndexEntry {
        tag_offsets,
        year,
        track_number,
        bitrate,
        length,
        playcount,
        rating,
        playtime,
        lastplayed,
        flags,
    })
}

/// Parse a string tag file into a map of data_offset -> string value.
/// `is_filename` controls whether padding is applied (filenames have none).
pub(super) fn parse_string_tag_file(
    data: &[u8],
    is_filename: bool,
) -> Result<HashMap<i32, String>, String> {
    if data.len() < TAG_HEADER_SIZE {
        return Ok(HashMap::new());
    }

    let magic = read_i32_le(data, 0);
    detect_version(magic)?;

    let mut map = HashMap::new();
    let mut pos = TAG_HEADER_SIZE;

    while pos + 8 <= data.len() {
        let data_offset = (pos - TAG_HEADER_SIZE) as i32;
        let tag_length = read_i32_le(data, pos) as usize;
        let _idx_id = read_i32_le(data, pos + 4);

        if tag_length == 0 || pos + 8 + tag_length > data.len() {
            break;
        }

        // String data starts at pos + 8, length includes null terminator
        let str_end = pos + 8 + tag_length;
        let raw = &data[pos + 8..str_end];

        // Trim null terminator and any padding
        let s = std::str::from_utf8(raw)
            .unwrap_or("")
            .trim_end_matches('\0')
            .trim_end_matches('X')
            .to_string();

        map.insert(data_offset, s);

        // Advance past entry: 8 (header) + tag_length
        let entry_len = 8 + tag_length;
        if is_filename {
            pos += entry_len;
        } else {
            // Padded to alignment: total entry length = 4 + 8*n
            // Entry data = 8 + tag_length, padded so that (entry_len) mod 8 == 4
            // In practice the tag_length already includes padding, so just advance
            pos += entry_len;
        }
    }

    Ok(map)
}

pub(super) fn lookup_string(maps: &[HashMap<i32, String>], file_idx: usize, offset: i32) -> String {
    if offset < 0 {
        return String::new();
    }
    maps.get(file_idx)
        .and_then(|m| m.get(&offset))
        .cloned()
        .unwrap_or_default()
}
