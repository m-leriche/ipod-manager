use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct WatchedArtist {
    pub id: i64,
    pub name: String,
    pub mb_artist_id: Option<String>,
    pub mb_artist_name: Option<String>,
    pub match_status: String,
    pub created_at: i64,
    pub last_checked_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiscoveredRelease {
    pub id: i64,
    pub watched_artist_id: i64,
    pub mb_release_group_id: String,
    pub title: String,
    pub artist_name: String,
    pub release_type: Option<String>,
    pub first_release_date: Option<String>,
    pub discovered_at: i64,
    pub dismissed: bool,
    pub in_library: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct NewReleasesCheckProgress {
    pub total_artists: usize,
    pub completed_artists: usize,
    pub current_artist: String,
    pub phase: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct NewReleasesCheckResult {
    pub artists_checked: usize,
    pub new_releases_found: usize,
    pub failed_lookups: usize,
    pub cancelled: bool,
}
