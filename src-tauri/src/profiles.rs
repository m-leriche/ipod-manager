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

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProfileStore {
    pub profiles: Vec<Profile>,
}

impl Default for ProfileStore {
    fn default() -> Self {
        Self { profiles: vec![] }
    }
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
    let data = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read profiles: {}", e))?;
    serde_json::from_str(&data)
        .map_err(|e| format!("Failed to parse profiles: {}", e))
}

pub fn save_profiles(app: &AppHandle, store: &ProfileStore) -> Result<(), String> {
    let path = profiles_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create data dir: {}", e))?;
    }
    let data = serde_json::to_string_pretty(store)
        .map_err(|e| format!("Failed to serialize profiles: {}", e))?;
    fs::write(&path, data)
        .map_err(|e| format!("Failed to write profiles: {}", e))
}

/// Check if a relative path should be excluded.
/// Exclusion "Podcasts" matches "Podcasts/ep.mp3" but not "Podcasts2/song.mp3".
pub fn is_excluded(path: &str, exclusions: &[String]) -> bool {
    exclusions.iter().any(|ex| {
        path == ex || path.starts_with(&format!("{}/", ex))
    })
}
