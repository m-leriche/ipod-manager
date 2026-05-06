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

// ── Unified file manager profiles ─────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FileManagerMode {
    #[default]
    Browse,
    Sync,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FileManagerProfile {
    pub name: String,
    #[serde(default)]
    pub mode: FileManagerMode,
    #[serde(default)]
    pub left_path: Option<String>,
    #[serde(default)]
    pub right_path: Option<String>,
    #[serde(default)]
    pub dual_pane: bool,
    #[serde(default = "default_layout")]
    pub layout: String,
    #[serde(default)]
    pub exclusions: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct FileManagerProfileStore {
    pub profiles: Vec<FileManagerProfile>,
    #[serde(default)]
    pub active_profile: Option<String>,
}

fn file_manager_profiles_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    Ok(dir.join("file_manager_profiles.json"))
}

/// Load unified profiles. If the new file doesn't exist, migrate from
/// the old `profiles.json` (sync) and `browse_profiles.json` (browse).
pub fn load_file_manager_profiles(app: &AppHandle) -> Result<FileManagerProfileStore, String> {
    let path = file_manager_profiles_path(app)?;
    if path.exists() {
        let data = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read file manager profiles: {}", e))?;
        return serde_json::from_str(&data)
            .map_err(|e| format!("Failed to parse file manager profiles: {}", e));
    }

    // Migrate from old profile files
    let mut profiles = Vec::new();
    let mut used_names = std::collections::HashSet::new();
    let mut active: Option<String> = None;

    let sync_store = load_profiles(app).unwrap_or_default();
    for p in sync_store.profiles {
        used_names.insert(p.name.clone());
        profiles.push(FileManagerProfile {
            name: p.name,
            mode: FileManagerMode::Sync,
            left_path: p.source_path,
            right_path: p.target_path,
            dual_pane: false,
            layout: default_layout(),
            exclusions: p.exclusions,
        });
    }
    // Prefer sync active profile if available
    if let Some(ref name) = sync_store.active_profile {
        active = Some(name.clone());
    }

    let browse_store = load_browse_profiles(app).unwrap_or_default();
    for p in browse_store.profiles {
        // Deduplicate names — if a sync profile already has this name, suffix it
        let name = if used_names.contains(&p.name) {
            format!("{} (browse)", p.name)
        } else {
            p.name
        };
        used_names.insert(name.clone());
        profiles.push(FileManagerProfile {
            name,
            mode: FileManagerMode::Browse,
            left_path: p.left_path,
            right_path: p.right_path,
            dual_pane: p.dual_pane,
            layout: p.layout,
            exclusions: Vec::new(),
        });
    }
    // Fall back to browse active if no sync active was set
    if active.is_none() {
        if let Some(ref name) = browse_store.active_profile {
            active = Some(name.clone());
        }
    }

    let store = FileManagerProfileStore {
        profiles,
        active_profile: active,
    };

    // Write the migrated store so we don't re-migrate next time
    if !store.profiles.is_empty() {
        if let Err(e) = save_file_manager_profiles(app, &store) {
            eprintln!("Warning: failed to write migrated profiles: {e}");
        }
    }

    Ok(store)
}

pub fn save_file_manager_profiles(
    app: &AppHandle,
    store: &FileManagerProfileStore,
) -> Result<(), String> {
    let path = file_manager_profiles_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create data dir: {}", e))?;
    }
    let data = serde_json::to_string_pretty(store)
        .map_err(|e| format!("Failed to serialize file manager profiles: {}", e))?;
    fs::write(&path, data).map_err(|e| format!("Failed to write file manager profiles: {}", e))
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
