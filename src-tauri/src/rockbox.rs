use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

const MAGIC_V10: i32 = 0x5443_4810;
const MAGIC_V0F: i32 = 0x5443_480F;
const HEADER_SIZE: usize = 24;
const TAG_HEADER_SIZE: usize = 12;
const FLAG_DELETED: i32 = 0x0001;

// ── Public Types ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct RockboxPlayData {
    pub total_tracks: usize,
    pub tracks: Vec<RockboxTrack>,
    pub max_serial: i32,
    pub rating_distribution: Vec<RatingEntry>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RockboxTrack {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub filename: String,
    pub genre: String,
    pub year: i32,
    pub track_number: i32,
    pub bitrate: i32,
    pub length_ms: i32,
    pub playcount: i32,
    pub rating: i32,
    pub playtime_ms: i32,
    pub lastplayed: i32,
    pub lastplayed_rank: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct RatingEntry {
    pub rating: i32,
    pub count: usize,
}

// ── Internal Types ──────────────────────────────────────────────

struct MasterHeader {
    entry_count: i32,
    serial: i32,
}

struct IndexEntry {
    tag_offsets: Vec<i32>,
    year: i32,
    track_number: i32,
    bitrate: i32,
    length: i32,
    playcount: i32,
    rating: i32,
    playtime: i32,
    lastplayed: i32,
    flags: i32,
}

#[derive(Clone, Copy)]
enum DbVersion {
    V0F,
    V10,
}

impl DbVersion {
    fn entry_size(self) -> usize {
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

fn read_i32_le(data: &[u8], offset: usize) -> i32 {
    i32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ])
}

fn detect_version(magic: i32) -> Result<DbVersion, String> {
    match magic {
        MAGIC_V10 => Ok(DbVersion::V10),
        MAGIC_V0F => Ok(DbVersion::V0F),
        _ => Err(format!(
            "Unknown TagCache version: 0x{:08X}. Expected 0x{:08X} (v16) or 0x{:08X} (v15)",
            magic, MAGIC_V10, MAGIC_V0F
        )),
    }
}

fn parse_master_header(data: &[u8]) -> Result<(DbVersion, MasterHeader), String> {
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

fn parse_index_entry(data: &[u8], offset: usize, version: DbVersion) -> Option<IndexEntry> {
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
fn parse_string_tag_file(data: &[u8], is_filename: bool) -> Result<HashMap<i32, String>, String> {
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

fn lookup_string(maps: &[HashMap<i32, String>], file_idx: usize, offset: i32) -> String {
    if offset < 0 {
        return String::new();
    }
    maps.get(file_idx)
        .and_then(|m| m.get(&offset))
        .cloned()
        .unwrap_or_default()
}

// ── Public API ──────────────────────────────────────────────────

pub fn read_rockbox_playdata(ipod_path: &str) -> Result<RockboxPlayData, String> {
    let rockbox_dir = Path::new(ipod_path).join(".rockbox");
    let idx_path = rockbox_dir.join("database_idx.tcd");

    if !idx_path.exists() {
        return Err(format!(
            "Rockbox database not found at {}. Make sure your iPod is mounted and has an initialized Rockbox database.",
            idx_path.display()
        ));
    }

    // Read master index
    let idx_data =
        fs::read(&idx_path).map_err(|e| format!("Failed to read {}: {}", idx_path.display(), e))?;

    let (version, header) = parse_master_header(&idx_data)?;

    // Read string tag files (0=artist, 1=album, 2=genre, 3=title, 4=filename)
    let needed_files = [
        (0, "database_0.tcd", false),
        (1, "database_1.tcd", false),
        (2, "database_2.tcd", false),
        (3, "database_3.tcd", false),
        (4, "database_4.tcd", true), // filename — no padding
    ];

    let mut string_maps: Vec<HashMap<i32, String>> = vec![HashMap::new(); 5];

    for (idx, filename, is_filename) in &needed_files {
        let path = rockbox_dir.join(filename);
        if path.exists() {
            let data =
                fs::read(&path).map_err(|e| format!("Failed to read {}: {}", filename, e))?;
            string_maps[*idx] = parse_string_tag_file(&data, *is_filename)?;
        }
    }

    // Parse index entries
    let entry_size = version.entry_size();
    let entry_count = header.entry_count as usize;
    let mut tracks = Vec::with_capacity(entry_count);

    for i in 0..entry_count {
        let offset = HEADER_SIZE + i * entry_size;
        let entry = match parse_index_entry(&idx_data, offset, version) {
            Some(e) => e,
            None => break,
        };

        if entry.flags & FLAG_DELETED != 0 {
            continue;
        }

        let artist = lookup_string(&string_maps, 0, entry.tag_offsets[0]);
        let album = lookup_string(&string_maps, 1, entry.tag_offsets[1]);
        let genre = lookup_string(&string_maps, 2, entry.tag_offsets[2]);
        let title = lookup_string(&string_maps, 3, entry.tag_offsets[3]);
        let filename = lookup_string(&string_maps, 4, entry.tag_offsets[4]);

        tracks.push(RockboxTrack {
            title,
            artist,
            album,
            filename,
            genre,
            year: entry.year,
            track_number: entry.track_number,
            bitrate: entry.bitrate,
            length_ms: entry.length,
            playcount: entry.playcount,
            rating: entry.rating,
            playtime_ms: entry.playtime,
            lastplayed: entry.lastplayed,
            lastplayed_rank: 0, // computed below
        });
    }

    // Compute lastplayed ranking (1 = most recent, higher = older)
    let mut ranked_indices: Vec<usize> = (0..tracks.len()).collect();
    ranked_indices.sort_by(|&a, &b| tracks[b].lastplayed.cmp(&tracks[a].lastplayed));
    for (rank, &idx) in ranked_indices.iter().enumerate() {
        tracks[idx].lastplayed_rank = rank + 1;
    }

    // Build rating distribution
    let mut rating_counts: HashMap<i32, usize> = HashMap::new();
    for t in &tracks {
        *rating_counts.entry(t.rating).or_insert(0) += 1;
    }
    let mut rating_distribution: Vec<RatingEntry> = rating_counts
        .into_iter()
        .map(|(rating, count)| RatingEntry { rating, count })
        .collect();
    rating_distribution.sort_by_key(|e| e.rating);

    let total_tracks = tracks.len();

    Ok(RockboxPlayData {
        total_tracks,
        tracks,
        max_serial: header.serial,
        rating_distribution,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_le_i32(val: i32) -> [u8; 4] {
        val.to_le_bytes()
    }

    fn build_master_header(magic: i32, datasize: i32, entry_count: i32, serial: i32) -> Vec<u8> {
        let mut buf = Vec::with_capacity(HEADER_SIZE);
        buf.extend_from_slice(&make_le_i32(magic));
        buf.extend_from_slice(&make_le_i32(datasize));
        buf.extend_from_slice(&make_le_i32(entry_count));
        buf.extend_from_slice(&make_le_i32(serial));
        buf.extend_from_slice(&make_le_i32(0)); // commitid
        buf.extend_from_slice(&make_le_i32(0)); // dirty
        buf
    }

    #[test]
    fn detect_version_v10() {
        let v = detect_version(MAGIC_V10).unwrap();
        assert!(matches!(v, DbVersion::V10));
    }

    #[test]
    fn detect_version_v0f() {
        let v = detect_version(MAGIC_V0F).unwrap();
        assert!(matches!(v, DbVersion::V0F));
    }

    #[test]
    fn detect_version_unknown_fails() {
        assert!(detect_version(0x12345678).is_err());
    }

    #[test]
    fn parse_master_header_v10() {
        let data = build_master_header(MAGIC_V10, 100, 5, 42);
        let (version, header) = parse_master_header(&data).unwrap();
        assert!(matches!(version, DbVersion::V10));
        assert_eq!(header.entry_count, 5);
        assert_eq!(header.serial, 42);
    }

    #[test]
    fn parse_master_header_too_small() {
        let data = vec![0u8; 10];
        assert!(parse_master_header(&data).is_err());
    }

    #[test]
    fn parse_index_entry_v10() {
        let mut entry = vec![0u8; 96];
        // tag_offsets[0] = artist at offset 100
        entry[0..4].copy_from_slice(&make_le_i32(100));
        // year at offset 36
        entry[36..40].copy_from_slice(&make_le_i32(2020));
        // track_number at offset 44
        entry[44..48].copy_from_slice(&make_le_i32(3));
        // canonical_artist at offset 48 (v10 only)
        entry[48..52].copy_from_slice(&make_le_i32(-1));
        // bitrate at offset 52
        entry[52..56].copy_from_slice(&make_le_i32(320));
        // length at offset 56
        entry[56..60].copy_from_slice(&make_le_i32(240000));
        // playcount at offset 60
        entry[60..64].copy_from_slice(&make_le_i32(15));
        // rating at offset 64
        entry[64..68].copy_from_slice(&make_le_i32(8));
        // playtime at offset 68
        entry[68..72].copy_from_slice(&make_le_i32(3600000));
        // lastplayed at offset 72
        entry[72..76].copy_from_slice(&make_le_i32(42));
        // flags at offset 92 (last 4 bytes)
        entry[92..96].copy_from_slice(&make_le_i32(0));

        let parsed = parse_index_entry(&entry, 0, DbVersion::V10).unwrap();
        assert_eq!(parsed.tag_offsets[0], 100);
        assert_eq!(parsed.year, 2020);
        assert_eq!(parsed.track_number, 3);
        assert_eq!(parsed.bitrate, 320);
        assert_eq!(parsed.length, 240000);
        assert_eq!(parsed.playcount, 15);
        assert_eq!(parsed.rating, 8);
        assert_eq!(parsed.playtime, 3600000);
        assert_eq!(parsed.lastplayed, 42);
        assert_eq!(parsed.flags, 0);
    }

    #[test]
    fn parse_index_entry_v0f() {
        let mut entry = vec![0u8; 92];
        // year at offset 36
        entry[36..40].copy_from_slice(&make_le_i32(1999));
        // track_number at offset 44
        entry[44..48].copy_from_slice(&make_le_i32(1));
        // bitrate at offset 48 (no canonical_artist in v0f)
        entry[48..52].copy_from_slice(&make_le_i32(192));
        // playcount at offset 56
        entry[56..60].copy_from_slice(&make_le_i32(5));
        // flags at offset 88 (last 4 bytes)
        entry[88..92].copy_from_slice(&make_le_i32(0));

        let parsed = parse_index_entry(&entry, 0, DbVersion::V0F).unwrap();
        assert_eq!(parsed.year, 1999);
        assert_eq!(parsed.bitrate, 192);
        assert_eq!(parsed.playcount, 5);
    }

    #[test]
    fn deleted_entries_flagged() {
        let mut entry = vec![0u8; 96];
        entry[92..96].copy_from_slice(&make_le_i32(FLAG_DELETED));

        let parsed = parse_index_entry(&entry, 0, DbVersion::V10).unwrap();
        assert_ne!(parsed.flags & FLAG_DELETED, 0);
    }

    #[test]
    fn parse_string_tag_file_basic() {
        let mut data = Vec::new();
        // Header
        data.extend_from_slice(&make_le_i32(MAGIC_V10));
        data.extend_from_slice(&make_le_i32(20)); // datasize
        data.extend_from_slice(&make_le_i32(1)); // entry_count

        // Entry: tag_length=6, idx_id=0, "Hello\0"
        data.extend_from_slice(&make_le_i32(6));
        data.extend_from_slice(&make_le_i32(0));
        data.extend_from_slice(b"Hello\0");

        let map = parse_string_tag_file(&data, false).unwrap();
        assert_eq!(map.get(&0).unwrap(), "Hello");
    }

    #[test]
    fn lastplayed_ranking() {
        let mut tracks = vec![
            RockboxTrack {
                title: "A".into(),
                artist: String::new(),
                album: String::new(),
                filename: String::new(),
                genre: String::new(),
                year: 0,
                track_number: 0,
                bitrate: 0,
                length_ms: 0,
                playcount: 1,
                rating: 0,
                playtime_ms: 0,
                lastplayed: 10,
                lastplayed_rank: 0,
            },
            RockboxTrack {
                title: "B".into(),
                artist: String::new(),
                album: String::new(),
                filename: String::new(),
                genre: String::new(),
                year: 0,
                track_number: 0,
                bitrate: 0,
                length_ms: 0,
                playcount: 5,
                rating: 0,
                playtime_ms: 0,
                lastplayed: 50,
                lastplayed_rank: 0,
            },
            RockboxTrack {
                title: "C".into(),
                artist: String::new(),
                album: String::new(),
                filename: String::new(),
                genre: String::new(),
                year: 0,
                track_number: 0,
                bitrate: 0,
                length_ms: 0,
                playcount: 0,
                rating: 0,
                playtime_ms: 0,
                lastplayed: 0,
                lastplayed_rank: 0,
            },
        ];

        // Rank them
        let mut ranked_indices: Vec<usize> = (0..tracks.len()).collect();
        ranked_indices.sort_by(|&a, &b| tracks[b].lastplayed.cmp(&tracks[a].lastplayed));
        for (rank, &idx) in ranked_indices.iter().enumerate() {
            tracks[idx].lastplayed_rank = rank + 1;
        }

        assert_eq!(tracks[0].lastplayed_rank, 2); // A: lastplayed=10, rank 2
        assert_eq!(tracks[1].lastplayed_rank, 1); // B: lastplayed=50, rank 1 (most recent)
        assert_eq!(tracks[2].lastplayed_rank, 3); // C: lastplayed=0, rank 3 (oldest/never)
    }
}
