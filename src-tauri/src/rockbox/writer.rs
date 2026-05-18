use std::collections::HashMap;
use std::fs;
use std::path::Path;

use super::parser::*;

// ── Public Types ────────────────────────────────────────────────

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct RockboxTrackUpdate {
    pub filename: String,
    pub playcount: Option<i32>,
    pub rating: Option<i32>,
}

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct WriteResult {
    pub updated: usize,
    pub not_found: usize,
    pub errors: Vec<String>,
}

// ── Writer ──────────────────────────────────────────────────────

/// Write updated playcount/rating values back to the Rockbox database.
///
/// Reads `database_idx.tcd`, matches entries by filename offset from
/// `database_4.tcd`, patches numeric fields in-place, and writes the
/// result atomically via a temp file + rename.
pub fn write_rockbox_playdata(
    ipod_path: &str,
    updates: &[RockboxTrackUpdate],
) -> Result<WriteResult, String> {
    if updates.is_empty() {
        return Ok(WriteResult {
            updated: 0,
            not_found: 0,
            errors: Vec::new(),
        });
    }

    let rockbox_dir = Path::new(ipod_path).join(".rockbox");
    let idx_path = rockbox_dir.join("database_idx.tcd");

    if !idx_path.exists() {
        return Err(format!(
            "Rockbox database not found at {}",
            idx_path.display()
        ));
    }

    // Read master index into a mutable buffer
    let mut idx_data =
        fs::read(&idx_path).map_err(|e| format!("Failed to read {}: {}", idx_path.display(), e))?;

    let (version, header) = parse_master_header(&idx_data)?;

    // Build reverse lookup: filename string → tag offset in database_4.tcd
    let filename_path = rockbox_dir.join("database_4.tcd");
    let filename_data =
        fs::read(&filename_path).map_err(|e| format!("Failed to read database_4.tcd: {}", e))?;
    let filename_map = parse_string_tag_file(&filename_data, true)?;

    // Invert: string → offset (for lookups by filename)
    let name_to_offset: HashMap<&str, i32> = filename_map
        .iter()
        .map(|(offset, name)| (name.as_str(), *offset))
        .collect();

    // Resolve each update to a filename tag offset
    let mut update_by_offset: HashMap<i32, &RockboxTrackUpdate> = HashMap::new();
    let mut not_found = 0;
    let mut errors = Vec::new();

    for update in updates {
        match name_to_offset.get(update.filename.as_str()) {
            Some(&offset) => {
                update_by_offset.insert(offset, update);
            }
            None => {
                not_found += 1;
                errors.push(format!(
                    "Filename not found in database: {}",
                    update.filename
                ));
            }
        }
    }

    // Walk index entries looking for matching filename offsets
    let entry_size = version.entry_size();
    let entry_count = header.entry_count as usize;
    let mut updated = 0;

    // The filename tag offset is at index 4 in the tag_offsets array (5th i32)
    let filename_tag_byte_offset = 4 * 4; // 16 bytes into entry

    for i in 0..entry_count {
        let offset = HEADER_SIZE + i * entry_size;
        if offset + entry_size > idx_data.len() {
            break;
        }

        // Check flags — skip deleted entries
        let flags = read_i32_le(&idx_data, offset + entry_size - 4);
        if flags & FLAG_DELETED != 0 {
            continue;
        }

        let fn_tag_offset = read_i32_le(&idx_data, offset + filename_tag_byte_offset);
        if let Some(update) = update_by_offset.get(&fn_tag_offset) {
            let num_base = version.numeric_offset();
            let extra = match version {
                DbVersion::V10 => 4,
                DbVersion::V0F => 0,
            };

            if let Some(playcount) = update.playcount {
                let pc_offset = offset + num_base + 20 + extra;
                write_i32_le(&mut idx_data, pc_offset, playcount);
            }
            if let Some(rating) = update.rating {
                let rt_offset = offset + num_base + 24 + extra;
                write_i32_le(&mut idx_data, rt_offset, rating);
            }

            updated += 1;
        }
    }

    if updated > 0 {
        // Increment serial number so Rockbox detects the change
        let new_serial = header.serial.wrapping_add(1);
        write_i32_le(&mut idx_data, 12, new_serial);

        // Atomic write: write to temp file, then rename
        let tmp_path = idx_path.with_extension("tcd.tmp");
        fs::write(&tmp_path, &idx_data).map_err(|e| format!("Failed to write temp file: {}", e))?;
        fs::rename(&tmp_path, &idx_path)
            .map_err(|e| format!("Failed to rename temp file: {}", e))?;
    }

    Ok(WriteResult {
        updated,
        not_found,
        errors,
    })
}

fn write_i32_le(data: &mut [u8], offset: usize, value: i32) {
    let bytes = value.to_le_bytes();
    data[offset..offset + 4].copy_from_slice(&bytes);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_le_i32(val: i32) -> [u8; 4] {
        val.to_le_bytes()
    }

    #[test]
    fn write_i32_le_roundtrip() {
        let mut buf = vec![0u8; 8];
        write_i32_le(&mut buf, 0, 42);
        write_i32_le(&mut buf, 4, -1);
        assert_eq!(read_i32_le(&buf, 0), 42);
        assert_eq!(read_i32_le(&buf, 4), -1);
    }

    #[test]
    fn empty_updates_returns_zero() {
        let result = write_rockbox_playdata("/nonexistent", &[]).unwrap();
        assert_eq!(result.updated, 0);
        assert_eq!(result.not_found, 0);
    }

    #[test]
    fn write_playcount_and_rating_v10() {
        let dir = tempfile::tempdir().unwrap();
        let rockbox_dir = dir.path().join(".rockbox");
        std::fs::create_dir_all(&rockbox_dir).unwrap();

        // Build a minimal database_idx.tcd with 1 entry (V10, 96 bytes/entry)
        let mut idx = Vec::new();
        // Header: magic, datasize, entry_count=1, serial=5, commitid=0, dirty=0
        idx.extend_from_slice(&make_le_i32(MAGIC_V10));
        idx.extend_from_slice(&make_le_i32(96)); // datasize
        idx.extend_from_slice(&make_le_i32(1)); // entry_count
        idx.extend_from_slice(&make_le_i32(5)); // serial
        idx.extend_from_slice(&make_le_i32(0)); // commitid
        idx.extend_from_slice(&make_le_i32(0)); // dirty

        // Entry (96 bytes): 9 tag offsets, then numerics
        let mut entry = vec![0u8; 96];
        // tag_offsets[4] = filename offset = 0 (points to first string in db4)
        entry[16..20].copy_from_slice(&make_le_i32(0));
        // year at 36
        entry[36..40].copy_from_slice(&make_le_i32(2020));
        // V10: canonical_artist at 48
        entry[48..52].copy_from_slice(&make_le_i32(-1));
        // playcount at 60 (num_base=36, +20 + extra=4 = 60)
        entry[60..64].copy_from_slice(&make_le_i32(10));
        // rating at 64
        entry[64..68].copy_from_slice(&make_le_i32(3));
        // flags at last 4 bytes = 0
        idx.extend_from_slice(&entry);

        std::fs::write(rockbox_dir.join("database_idx.tcd"), &idx).unwrap();

        // Build database_4.tcd (filename strings)
        let mut db4 = Vec::new();
        // Tag file header: magic, datasize, entry_count
        db4.extend_from_slice(&make_le_i32(MAGIC_V10));
        db4.extend_from_slice(&make_le_i32(20)); // datasize
        db4.extend_from_slice(&make_le_i32(1)); // entry_count
                                                // Entry: tag_length=10, idx_id=0, "test.mp3\0\0" (padded to 10)
        db4.extend_from_slice(&make_le_i32(10));
        db4.extend_from_slice(&make_le_i32(0));
        db4.extend_from_slice(b"test.mp3\0\0");

        std::fs::write(rockbox_dir.join("database_4.tcd"), &db4).unwrap();

        let updates = vec![RockboxTrackUpdate {
            filename: "test.mp3".to_string(),
            playcount: Some(42),
            rating: Some(8),
        }];

        let result = write_rockbox_playdata(dir.path().to_str().unwrap(), &updates).unwrap();
        assert_eq!(result.updated, 1);
        assert_eq!(result.not_found, 0);

        // Verify written data
        let written = std::fs::read(rockbox_dir.join("database_idx.tcd")).unwrap();
        // Serial should be incremented to 6
        assert_eq!(read_i32_le(&written, 12), 6);
        // playcount at HEADER_SIZE + 60
        assert_eq!(read_i32_le(&written, HEADER_SIZE + 60), 42);
        // rating at HEADER_SIZE + 64
        assert_eq!(read_i32_le(&written, HEADER_SIZE + 64), 8);
    }

    #[test]
    fn write_not_found_filename() {
        let dir = tempfile::tempdir().unwrap();
        let rockbox_dir = dir.path().join(".rockbox");
        std::fs::create_dir_all(&rockbox_dir).unwrap();

        // Minimal database with 0 entries
        let mut idx = Vec::new();
        idx.extend_from_slice(&make_le_i32(MAGIC_V10));
        idx.extend_from_slice(&make_le_i32(0));
        idx.extend_from_slice(&make_le_i32(0)); // 0 entries
        idx.extend_from_slice(&make_le_i32(1));
        idx.extend_from_slice(&make_le_i32(0));
        idx.extend_from_slice(&make_le_i32(0));
        std::fs::write(rockbox_dir.join("database_idx.tcd"), &idx).unwrap();

        // Empty filename tag file
        let mut db4 = Vec::new();
        db4.extend_from_slice(&make_le_i32(MAGIC_V10));
        db4.extend_from_slice(&make_le_i32(0));
        db4.extend_from_slice(&make_le_i32(0));
        std::fs::write(rockbox_dir.join("database_4.tcd"), &db4).unwrap();

        let updates = vec![RockboxTrackUpdate {
            filename: "nonexistent.mp3".to_string(),
            playcount: Some(5),
            rating: None,
        }];

        let result = write_rockbox_playdata(dir.path().to_str().unwrap(), &updates).unwrap();
        assert_eq!(result.updated, 0);
        assert_eq!(result.not_found, 1);
    }

    #[test]
    fn write_skips_deleted_entries() {
        let dir = tempfile::tempdir().unwrap();
        let rockbox_dir = dir.path().join(".rockbox");
        std::fs::create_dir_all(&rockbox_dir).unwrap();

        let mut idx = Vec::new();
        idx.extend_from_slice(&make_le_i32(MAGIC_V10));
        idx.extend_from_slice(&make_le_i32(96));
        idx.extend_from_slice(&make_le_i32(1));
        idx.extend_from_slice(&make_le_i32(1));
        idx.extend_from_slice(&make_le_i32(0));
        idx.extend_from_slice(&make_le_i32(0));

        let mut entry = vec![0u8; 96];
        entry[16..20].copy_from_slice(&make_le_i32(0));
        entry[60..64].copy_from_slice(&make_le_i32(10));
        // Set deleted flag
        entry[92..96].copy_from_slice(&make_le_i32(FLAG_DELETED));
        idx.extend_from_slice(&entry);

        std::fs::write(rockbox_dir.join("database_idx.tcd"), &idx).unwrap();

        let mut db4 = Vec::new();
        db4.extend_from_slice(&make_le_i32(MAGIC_V10));
        db4.extend_from_slice(&make_le_i32(20));
        db4.extend_from_slice(&make_le_i32(1));
        db4.extend_from_slice(&make_le_i32(10));
        db4.extend_from_slice(&make_le_i32(0));
        db4.extend_from_slice(b"test.mp3\0\0");
        std::fs::write(rockbox_dir.join("database_4.tcd"), &db4).unwrap();

        let updates = vec![RockboxTrackUpdate {
            filename: "test.mp3".to_string(),
            playcount: Some(99),
            rating: None,
        }];

        let result = write_rockbox_playdata(dir.path().to_str().unwrap(), &updates).unwrap();
        // Entry is deleted, so nothing should be updated
        assert_eq!(result.updated, 0);

        // Verify playcount was NOT changed
        let written = std::fs::read(rockbox_dir.join("database_idx.tcd")).unwrap();
        assert_eq!(read_i32_le(&written, HEADER_SIZE + 60), 10);
    }
}
