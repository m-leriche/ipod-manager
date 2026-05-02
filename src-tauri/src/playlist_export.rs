use crate::library::types::{Playlist, PlaylistTrack};
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
pub struct PlaylistExportResult {
    pub exported: usize,
    pub total_tracks: usize,
    pub errors: Vec<String>,
}

/// Generate Rockbox-compatible `.m3u8` files from playlists.
///
/// Each track's local `file_path` is mapped to a Rockbox-relative path by
/// stripping `library_root` and prepending `/{music_subdir}/`.
/// Files are written to `output_dir`.
pub fn export_playlists(
    playlists: Vec<(Playlist, Vec<PlaylistTrack>)>,
    library_root: &str,
    music_subdir: &str,
    output_dir: &str,
) -> PlaylistExportResult {
    let out = Path::new(output_dir);
    if let Err(e) = fs::create_dir_all(out) {
        return PlaylistExportResult {
            exported: 0,
            total_tracks: 0,
            errors: vec![format!("Failed to create output directory: {}", e)],
        };
    }

    let lib_root = library_root.trim_end_matches('/');
    let sub = music_subdir.trim_matches('/');

    let mut exported = 0usize;
    let mut total_tracks = 0usize;
    let mut errors = Vec::new();

    for (playlist, tracks) in &playlists {
        let mut m3u = String::from("#EXTM3U\n");

        for pt in tracks {
            total_tracks += 1;

            let rel = match pt.track.file_path.strip_prefix(lib_root) {
                Some(r) => r.trim_start_matches('/'),
                None => {
                    errors.push(format!(
                        "\"{}\" — track outside library root, skipped",
                        pt.track.file_name
                    ));
                    continue;
                }
            };

            let duration = pt.track.duration_secs.round() as i64;
            let artist = pt.track.artist.as_deref().unwrap_or("Unknown Artist");
            let title = pt
                .track
                .title
                .as_deref()
                .unwrap_or(pt.track.file_name.as_str());

            m3u.push_str(&format!("#EXTINF:{},{} - {}\n", duration, artist, title));
            m3u.push_str(&format!("/{}/{}\n", sub, rel));
        }

        let safe_name = sanitize_filename(&playlist.name);
        let dest = out.join(format!("{}.m3u8", safe_name));

        if let Err(e) = fs::write(&dest, m3u.as_bytes()) {
            errors.push(format!("Failed to write \"{}\": {}", playlist.name, e));
            continue;
        }

        exported += 1;
    }

    PlaylistExportResult {
        exported,
        total_tracks,
        errors,
    }
}

/// Replace characters that are invalid in FAT32 filenames.
fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::types::LibraryTrack;

    fn make_track(file_path: &str, title: &str, artist: &str, duration: f64) -> PlaylistTrack {
        PlaylistTrack {
            position: 0,
            track: LibraryTrack {
                id: 1,
                file_path: file_path.to_string(),
                file_name: file_path.rsplit('/').next().unwrap_or("").to_string(),
                folder_path: String::new(),
                title: Some(title.to_string()),
                artist: Some(artist.to_string()),
                album: None,
                album_artist: None,
                sort_artist: None,
                sort_album_artist: None,
                track_number: None,
                track_total: None,
                disc_number: None,
                disc_total: None,
                year: None,
                genre: None,
                duration_secs: duration,
                sample_rate: None,
                bitrate_kbps: None,
                format: "flac".to_string(),
                file_size: 0,
                created_at: 0,
                play_count: 0,
                flagged: false,
                rating: 0,
            },
        }
    }

    #[test]
    fn sanitize_replaces_bad_chars() {
        assert_eq!(sanitize_filename("My: Playlist/2"), "My_ Playlist_2");
    }

    #[test]
    fn sanitize_leaves_clean_names() {
        assert_eq!(sanitize_filename("Chill Vibes"), "Chill Vibes");
    }

    #[test]
    fn export_generates_m3u8() {
        let dir = std::env::temp_dir().join("crate_test_export");
        let _ = fs::remove_dir_all(&dir);

        let playlist = Playlist {
            id: 1,
            name: "Test".to_string(),
            track_count: 2,
            total_duration: 500.0,
            created_at: 0,
            updated_at: 0,
        };
        let tracks = vec![
            make_track("/Music/Artist/Album/song.flac", "Song", "Artist", 243.0),
            make_track("/Music/Artist/Album/two.flac", "Two", "Artist", 301.0),
        ];

        let result = export_playlists(
            vec![(playlist, tracks)],
            "/Music",
            "Music",
            dir.to_str().unwrap(),
        );
        assert_eq!(result.exported, 1);
        assert_eq!(result.total_tracks, 2);
        assert!(result.errors.is_empty());

        let content = fs::read_to_string(dir.join("Test.m3u8")).unwrap();
        assert!(content.starts_with("#EXTM3U\n"));
        assert!(content.contains("#EXTINF:243,Artist - Song\n"));
        assert!(content.contains("/Music/Artist/Album/song.flac\n"));

        let _ = fs::remove_dir_all(&dir);
    }
}
