use super::*;
use crate::library::types::LibraryTrack;
use std::fs;

fn make_track(file_path: &str) -> LibraryTrack {
    LibraryTrack {
        id: 1,
        file_path: file_path.to_string(),
        file_name: file_path.rsplit('/').next().unwrap_or("").to_string(),
        folder_path: String::new(),
        title: None,
        artist: None,
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
        duration_secs: 100.0,
        sample_rate: None,
        bitrate_kbps: None,
        format: "flac".to_string(),
        file_size: 0,
        created_at: 0,
        play_count: 0,
        last_played: None,
        flagged: false,
        rating: 0,
        compilation: false,
        replay_gain_track_db: None,
        replay_gain_album_db: None,
    }
}

fn make_playlist(id: i64, name: &str) -> Playlist {
    Playlist {
        id,
        name: name.to_string(),
        track_count: 0,
        total_duration: 0.0,
        created_at: 0,
        updated_at: 0,
    }
}

fn resolved(id: i64, name: &str, paths: &[&str]) -> ResolvedPlaylist {
    ResolvedPlaylist {
        playlist: make_playlist(id, name),
        is_smart: false,
        tracks: paths
            .iter()
            .enumerate()
            .map(|(i, p)| PlaylistTrack {
                position: i as u32,
                track: make_track(p),
            })
            .collect(),
    }
}

#[test]
fn dedupe_removes_tracks_shared_across_playlists() {
    let playlists = vec![
        resolved(1, "A", &["/lib/a.flac", "/lib/b.flac"]),
        resolved(2, "B", &["/lib/b.flac", "/lib/c.flac"]),
    ];

    let tracks = dedupe_tracks(&playlists);
    let paths: Vec<&str> = tracks.iter().map(|t| t.file_path.as_str()).collect();
    assert_eq!(paths, vec!["/lib/a.flac", "/lib/b.flac", "/lib/c.flac"]);
}

#[test]
fn plan_detects_already_present_and_missing_files() {
    let tmp = tempfile::tempdir().unwrap();
    let lib = tmp.path().join("lib");
    let ipod_music = tmp.path().join("ipod/Music");
    fs::create_dir_all(lib.join("Artist/Album")).unwrap();
    fs::create_dir_all(ipod_music.join("Artist/Album")).unwrap();

    // Present on iPod with same size — costs nothing
    fs::write(lib.join("Artist/Album/same.flac"), b"12345").unwrap();
    fs::write(ipod_music.join("Artist/Album/same.flac"), b"12345").unwrap();
    // Present on iPod but different size — must be re-copied
    fs::write(lib.join("Artist/Album/stale.flac"), b"1234567890").unwrap();
    fs::write(ipod_music.join("Artist/Album/stale.flac"), b"123").unwrap();
    // Not on iPod at all
    fs::write(lib.join("Artist/Album/new.flac"), b"1234567").unwrap();

    let lib_root = lib.to_str().unwrap().to_string();
    let tracks_owned: Vec<LibraryTrack> = ["same.flac", "stale.flac", "new.flac"]
        .iter()
        .map(|n| make_track(&format!("{}/Artist/Album/{}", lib_root, n)))
        .collect();
    let tracks: Vec<&LibraryTrack> = tracks_owned.iter().collect();

    let plan = plan_copies(&tracks, &lib_root, &ipod_music);

    assert_eq!(plan.already_present, 1);
    assert_eq!(plan.bytes_already_present, 5);
    assert_eq!(plan.operations.len(), 2);
    assert_eq!(plan.bytes_to_copy, 10 + 7);
    assert!(plan.errors.is_empty());

    let dests: Vec<&str> = plan
        .operations
        .iter()
        .map(|op| op.dest_path.as_str())
        .collect();
    assert!(dests
        .iter()
        .all(|d| d.starts_with(ipod_music.to_str().unwrap())));
    assert!(dests.iter().any(|d| d.ends_with("Artist/Album/stale.flac")));
    assert!(dests.iter().any(|d| d.ends_with("Artist/Album/new.flac")));
}

#[test]
fn plan_skips_track_outside_library_root() {
    let tmp = tempfile::tempdir().unwrap();
    let lib = tmp.path().join("lib");
    fs::create_dir_all(&lib).unwrap();

    let track = make_track("/elsewhere/song.flac");
    let tracks = vec![&track];

    let plan = plan_copies(&tracks, lib.to_str().unwrap(), &tmp.path().join("Music"));

    assert!(plan.operations.is_empty());
    assert_eq!(plan.errors.len(), 1);
    assert!(plan.errors[0].contains("outside library root"));
}

#[test]
fn plan_skips_unreadable_source() {
    let tmp = tempfile::tempdir().unwrap();
    let lib_root = tmp.path().join("lib").to_str().unwrap().to_string();

    let track = make_track(&format!("{}/missing.flac", lib_root));
    let tracks = vec![&track];

    let plan = plan_copies(&tracks, &lib_root, &tmp.path().join("Music"));

    assert!(plan.operations.is_empty());
    assert_eq!(plan.bytes_to_copy, 0);
    assert_eq!(plan.errors.len(), 1);
    assert!(plan.errors[0].contains("source unreadable"));
}

#[test]
fn build_plan_reports_per_playlist_counts_and_dedupes_totals() {
    let tmp = tempfile::tempdir().unwrap();
    let lib = tmp.path().join("lib");
    let mount = tmp.path().join("ipod");
    fs::create_dir_all(&lib).unwrap();
    fs::create_dir_all(&mount).unwrap();
    fs::write(lib.join("a.flac"), b"aaaa").unwrap();
    fs::write(lib.join("b.flac"), b"bbbbbb").unwrap();

    let lib_root = lib.to_str().unwrap().to_string();
    let a = format!("{}/a.flac", lib_root);
    let b = format!("{}/b.flac", lib_root);
    let mut playlists = vec![resolved(1, "One", &[&a, &b]), resolved(2, "Two", &[&b])];
    playlists[1].is_smart = true;

    let plan = build_plan(&playlists, &lib_root, mount.to_str().unwrap());

    assert_eq!(plan.playlists.len(), 2);
    assert_eq!(plan.playlists[0].track_count, 2);
    assert_eq!(plan.playlists[1].track_count, 1);
    assert!(plan.playlists[1].is_smart);
    assert_eq!(plan.total_tracks, 2); // b deduped
    assert_eq!(plan.files_to_copy, 2);
    assert_eq!(plan.bytes_to_copy, 4 + 6);
    assert_eq!(plan.bytes_already_present, 0);
    assert!(plan.errors.is_empty());
}
