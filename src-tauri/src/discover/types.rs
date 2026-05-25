use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoverAlbum {
    pub name: String,
    pub artist_name: String,
    pub image_url: Option<String>,
    pub listeners: u64,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoverSection {
    pub seed_artist: String,
    pub albums: Vec<DiscoverAlbum>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SeedStrategy {
    #[default]
    Random,
    MostPlayed,
    RecentlyPlayed,
    RecentlyAdded,
}
