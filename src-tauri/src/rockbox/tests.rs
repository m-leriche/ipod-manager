use super::parser::*;
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
