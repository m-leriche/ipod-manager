use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryTrack {
    pub id: i64,
    pub file_path: String,
    pub file_name: String,
    pub folder_path: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub sort_artist: Option<String>,
    pub sort_album_artist: Option<String>,
    pub track_number: Option<u32>,
    pub track_total: Option<u32>,
    pub disc_number: Option<u32>,
    pub disc_total: Option<u32>,
    pub year: Option<u32>,
    pub genre: Option<String>,
    pub duration_secs: f64,
    pub sample_rate: Option<u32>,
    pub bitrate_kbps: Option<u32>,
    pub format: String,
    pub file_size: u64,
    pub created_at: i64,
    pub play_count: u32,
    pub flagged: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct LibraryFolder {
    pub id: i64,
    pub path: String,
    pub added_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ArtistSummary {
    pub name: String,
    pub track_count: usize,
    pub album_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct AlbumSummary {
    pub name: String,
    pub artist: String,
    pub year: Option<u32>,
    pub track_count: usize,
    pub folder_path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GenreSummary {
    pub name: String,
    pub track_count: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LibraryFilter {
    pub artist: Option<String>,
    pub album: Option<String>,
    pub genre: Option<String>,
    pub search: Option<String>,
    pub sort_by: Option<String>,
    pub sort_direction: Option<String>,
    pub flagged_only: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BrowserData {
    pub tracks: Vec<LibraryTrack>,
    pub genres: Vec<GenreSummary>,
    pub artists: Vec<ArtistSummary>,
    pub albums: Vec<AlbumSummary>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LibraryScanProgress {
    pub total: usize,
    pub completed: usize,
    pub current_file: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportResult {
    pub total_files: usize,
    pub copied: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportProgress {
    pub total: usize,
    pub completed: usize,
    pub current_file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playlist {
    pub id: i64,
    pub name: String,
    pub track_count: u32,
    pub total_duration: f64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct PlaylistTrack {
    pub position: u32,
    #[serde(flatten)]
    pub track: LibraryTrack,
}

pub(crate) struct TrackData {
    pub file_path: String,
    pub file_name: String,
    pub folder_path: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub sort_artist: Option<String>,
    pub sort_album_artist: Option<String>,
    pub track_number: Option<u32>,
    pub track_total: Option<u32>,
    pub disc_number: Option<u32>,
    pub disc_total: Option<u32>,
    pub year: Option<u32>,
    pub genre: Option<String>,
    pub duration_secs: f64,
    pub sample_rate: Option<u32>,
    pub bitrate_kbps: Option<u32>,
    pub format: String,
    pub file_size: u64,
    pub play_count: Option<u32>,
}
