use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Profile {
    pub name: String,
    #[serde(default)]
    pub source_path: Option<String>,
    #[serde(default)]
    pub target_path: Option<String>,
    #[serde(default)]
    pub exclusions: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ProfileStore {
    pub profiles: Vec<Profile>,
    #[serde(default)]
    pub active_profile: Option<String>,
}

fn profiles_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    Ok(dir.join("profiles.json"))
}

pub fn load_profiles(app: &AppHandle) -> Result<ProfileStore, String> {
    let path = profiles_path(app)?;
    if !path.exists() {
        return Ok(ProfileStore::default());
    }
    let data = fs::read_to_string(&path).map_err(|e| format!("Failed to read profiles: {}", e))?;
    serde_json::from_str(&data).map_err(|e| format!("Failed to parse profiles: {}", e))
}

pub fn save_profiles(app: &AppHandle, store: &ProfileStore) -> Result<(), String> {
    let path = profiles_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create data dir: {}", e))?;
    }
    let data = serde_json::to_string_pretty(store)
        .map_err(|e| format!("Failed to serialize profiles: {}", e))?;
    fs::write(&path, data).map_err(|e| format!("Failed to write profiles: {}", e))
}

// ── Browse profiles ──────────────────────────────────────────────

fn default_layout() -> String {
    "horizontal".to_string()
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BrowseProfile {
    pub name: String,
    #[serde(default)]
    pub left_path: Option<String>,
    #[serde(default)]
    pub right_path: Option<String>,
    #[serde(default)]
    pub dual_pane: bool,
    #[serde(default = "default_layout")]
    pub layout: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct BrowseProfileStore {
    pub profiles: Vec<BrowseProfile>,
    #[serde(default)]
    pub active_profile: Option<String>,
}

fn browse_profiles_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    Ok(dir.join("browse_profiles.json"))
}

pub fn load_browse_profiles(app: &AppHandle) -> Result<BrowseProfileStore, String> {
    let path = browse_profiles_path(app)?;
    if !path.exists() {
        return Ok(BrowseProfileStore::default());
    }
    let data =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read browse profiles: {}", e))?;
    serde_json::from_str(&data).map_err(|e| format!("Failed to parse browse profiles: {}", e))
}

pub fn save_browse_profiles(app: &AppHandle, store: &BrowseProfileStore) -> Result<(), String> {
    let path = browse_profiles_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create data dir: {}", e))?;
    }
    let data = serde_json::to_string_pretty(store)
        .map_err(|e| format!("Failed to serialize browse profiles: {}", e))?;
    fs::write(&path, data).map_err(|e| format!("Failed to write browse profiles: {}", e))
}

/// Check if a relative path should be excluded.
/// Exclusion "Podcasts" matches "Podcasts/ep.mp3" but not "Podcasts2/song.mp3".
pub fn is_excluded(path: &str, exclusions: &[String]) -> bool {
    exclusions
        .iter()
        .any(|ex| path == ex || path.starts_with(&format!("{}/", ex)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn excluded_exact_match() {
        let ex = vec!["Podcasts".to_string()];
        assert!(is_excluded("Podcasts", &ex));
    }

    #[test]
    fn excluded_prefix_match() {
        let ex = vec!["Podcasts".to_string()];
        assert!(is_excluded("Podcasts/episode1.mp3", &ex));
    }

    #[test]
    fn excluded_no_partial_match() {
        let ex = vec!["Podcasts".to_string()];
        assert!(!is_excluded("Podcasts2/song.mp3", &ex));
    }

    #[test]
    fn excluded_empty_exclusions() {
        let ex: Vec<String> = vec![];
        assert!(!is_excluded("Podcasts", &ex));
    }

    #[test]
    fn excluded_multiple_exclusions() {
        let ex = vec!["Podcasts".to_string(), "Audiobooks".to_string()];
        assert!(is_excluded("Audiobooks/ch1.mp3", &ex));
        assert!(!is_excluded("Music/song.mp3", &ex));
    }
}
