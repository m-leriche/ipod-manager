//! Last.fm top-tag fetching for albums and artists.

use crate::lastfm;

#[derive(Debug, Clone)]
pub(crate) struct TagCount {
    pub name: String,
    /// Relative popularity 100→0 within the entity's tags.
    pub weight: u32,
}

pub(super) fn album_top_tags(artist: &str, album: &str) -> Result<Vec<TagCount>, String> {
    let json = lastfm::api_get_public(&[
        ("method", "album.gettoptags"),
        ("artist", artist),
        ("album", album),
        ("autocorrect", "1"),
    ])?;
    Ok(parse_toptags(&json))
}

pub(super) fn artist_top_tags(artist: &str) -> Result<Vec<TagCount>, String> {
    let json = lastfm::api_get_public(&[
        ("method", "artist.gettoptags"),
        ("artist", artist),
        ("autocorrect", "1"),
    ])?;
    Ok(parse_toptags(&json))
}

/// Parse `toptags.tag` from a Last.fm response. The API returns an array
/// normally, but a single tag comes back as a bare object.
pub(crate) fn parse_toptags(json: &serde_json::Value) -> Vec<TagCount> {
    let tag = &json["toptags"]["tag"];
    let items: Vec<&serde_json::Value> = if let Some(arr) = tag.as_array() {
        arr.iter().collect()
    } else if tag.is_object() {
        vec![tag]
    } else {
        Vec::new()
    };

    items
        .into_iter()
        .filter_map(|t| {
            let name = t["name"].as_str()?.to_string();
            let weight = t["count"].as_u64().unwrap_or(0) as u32;
            Some(TagCount { name, weight })
        })
        .collect()
}
