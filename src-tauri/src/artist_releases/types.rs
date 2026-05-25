use serde::Serialize;
use std::fmt;
use std::str::FromStr;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MatchStatus {
    Pending,
    Matched,
    Ambiguous,
    Manual,
}

impl fmt::Display for MatchStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Pending => write!(f, "pending"),
            Self::Matched => write!(f, "matched"),
            Self::Ambiguous => write!(f, "ambiguous"),
            Self::Manual => write!(f, "manual"),
        }
    }
}

impl FromStr for MatchStatus {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "pending" => Ok(Self::Pending),
            "matched" => Ok(Self::Matched),
            "ambiguous" => Ok(Self::Ambiguous),
            "manual" => Ok(Self::Manual),
            _ => Err(format!("Unknown match status: {}", s)),
        }
    }
}

impl rusqlite::types::FromSql for MatchStatus {
    fn column_result(value: rusqlite::types::ValueRef<'_>) -> rusqlite::types::FromSqlResult<Self> {
        let s = value.as_str()?;
        Self::from_str(s).map_err(|e| rusqlite::types::FromSqlError::Other(e.into()))
    }
}

impl rusqlite::types::ToSql for MatchStatus {
    fn to_sql(&self) -> rusqlite::Result<rusqlite::types::ToSqlOutput<'_>> {
        Ok(rusqlite::types::ToSqlOutput::from(self.to_string()))
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct WatchedArtist {
    pub id: i64,
    pub name: String,
    pub mb_artist_id: Option<String>,
    pub mb_artist_name: Option<String>,
    pub match_status: MatchStatus,
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
