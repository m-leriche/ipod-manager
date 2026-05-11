use std::collections::HashMap;
use std::fs;
use std::path::Path;

use super::parser::*;
use super::*;

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
