use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CheckStatus {
    Pass,
    Warn,
    Fail,
    Pending,
}

#[derive(Debug, Clone, Serialize)]
pub struct CheckResult {
    pub status: CheckStatus,
    pub detail: Option<String>,
}

impl CheckResult {
    pub fn pass(detail: Option<String>) -> Self {
        Self {
            status: CheckStatus::Pass,
            detail,
        }
    }

    pub fn warn(detail: String) -> Self {
        Self {
            status: CheckStatus::Warn,
            detail: Some(detail),
        }
    }

    pub fn fail(detail: String) -> Self {
        Self {
            status: CheckStatus::Fail,
            detail: Some(detail),
        }
    }

    pub fn pending() -> Self {
        Self {
            status: CheckStatus::Pending,
            detail: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct AlbumChecks {
    pub tags: CheckResult,
    pub cover: CheckResult,
    pub tracklist: CheckResult,
    pub duplicate: CheckResult,
}

#[derive(Debug, Clone, Serialize)]
pub struct InboxTrack {
    pub file_path: String,
    pub file_name: String,
    pub title: Option<String>,
    pub track_number: Option<u32>,
    pub duration_secs: f64,
    pub format: String,
    pub bitrate_kbps: Option<u32>,
    pub sample_rate: Option<u32>,
    pub bit_depth: Option<u8>,
}

#[derive(Debug, Clone, Serialize)]
pub struct InboxAlbum {
    pub folder_path: String,
    pub folder_name: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub year: Option<u32>,
    pub tracks: Vec<InboxTrack>,
    pub checks: AlbumChecks,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMove {
    pub from: String,
    pub to: String,
    pub is_audio: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileAwayResult {
    pub moves: Vec<FileMove>,
    pub errors: Vec<String>,
}
