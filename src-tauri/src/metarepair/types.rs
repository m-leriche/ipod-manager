use crate::metadata::TrackMetadata;
use crate::musicbrainz::{MbRelease, MbReleaseDetail, MbTrack};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum IssueSeverity {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum IssueKind {
    TitleMismatch,
    TrackNumberMissing,
    TrackNumberWrong,
    ArtistInconsistent,
    AlbumNameMismatch,
    YearMissing,
    YearMismatch,
    AlbumArtistMissing,
    SortArtistMissing,
    SortAlbumArtistMissing,
    TrackTotalWrong,
    MissingTrack,
}

#[derive(Debug, Clone, Serialize)]
pub struct TrackIssue {
    pub file_path: String,
    pub kind: IssueKind,
    pub severity: IssueSeverity,
    pub field: String,
    pub local_value: Option<String>,
    pub suggested_value: Option<String>,
    pub description: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TrackMatch {
    pub local_track: TrackMetadata,
    pub mb_track: Option<MbTrack>,
    pub match_confidence: f64,
    pub issues: Vec<TrackIssue>,
}

#[derive(Debug, Clone, Serialize)]
pub struct IssueSummary {
    pub error_count: usize,
    pub warning_count: usize,
    pub info_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct AlbumRepairReport {
    pub artist: String,
    pub album: String,
    pub folder_path: String,
    pub selected_release: Option<MbReleaseDetail>,
    pub alternative_releases: Vec<MbRelease>,
    pub match_confidence: f64,
    pub track_matches: Vec<TrackMatch>,
    pub missing_tracks: Vec<MbTrack>,
    pub issue_summary: IssueSummary,
}

#[derive(Debug, Clone, Serialize)]
pub struct RepairReport {
    pub albums: Vec<AlbumRepairReport>,
    pub total_issues: IssueSummary,
}

#[derive(Debug, Clone, Serialize)]
pub struct RepairLookupProgress {
    pub total_albums: usize,
    pub completed_albums: usize,
    pub current_album: String,
    pub phase: String,
}

pub(super) struct AlbumGroup {
    pub artist: String,
    pub album: String,
    pub folder_path: String,
    pub tracks: Vec<TrackMetadata>,
}
