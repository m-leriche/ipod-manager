use super::types::DiscoverAlbum;

pub fn fetch_similar_artists(artist: &str, limit: u32) -> Result<Vec<(String, f64)>, String> {
    let limit_str = limit.to_string();
    let json = crate::lastfm::api_get_public(&[
        ("method", "artist.getSimilar"),
        ("artist", artist),
        ("limit", &limit_str),
        ("autocorrect", "1"),
    ])?;

    let artists = json["similarartists"]["artist"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|a| {
                    let name = a["name"].as_str()?.to_string();
                    // Score is only used for ordering (Last.fm returns pre-sorted),
                    // not consumed downstream — kept for potential future use.
                    let score = a["match"]
                        .as_str()
                        .and_then(|s| s.parse::<f64>().ok())
                        .or_else(|| a["match"].as_f64())
                        .unwrap_or(0.0);
                    Some((name, score))
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(artists)
}

pub fn fetch_top_albums(artist: &str, limit: u32) -> Result<Vec<DiscoverAlbum>, String> {
    let limit_str = limit.to_string();
    let json = crate::lastfm::api_get_public(&[
        ("method", "artist.getTopAlbums"),
        ("artist", artist),
        ("limit", &limit_str),
        ("autocorrect", "1"),
    ])?;

    let albums = json["topalbums"]["album"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|a| {
                    let name = a["name"].as_str()?.to_string();
                    if name == "(null)" || name.is_empty() {
                        return None;
                    }

                    let artist_name = a["artist"]["name"].as_str().unwrap_or_default().to_string();
                    let url = a["url"].as_str().unwrap_or_default().to_string();
                    let listeners = a["playcount"]
                        .as_u64()
                        .or_else(|| a["playcount"].as_str().and_then(|s| s.parse().ok()))
                        .unwrap_or(0);

                    let image_url = largest_image(a);

                    Some(DiscoverAlbum {
                        name,
                        artist_name,
                        image_url,
                        listeners,
                        url,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(albums)
}

pub fn fetch_tag_top_albums(tag: &str, limit: u32) -> Result<Vec<DiscoverAlbum>, String> {
    let limit_str = limit.to_string();
    let json = crate::lastfm::api_get_public(&[
        ("method", "tag.getTopAlbums"),
        ("tag", tag),
        ("limit", &limit_str),
    ])?;

    let albums = json["albums"]["album"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|a| {
                    let name = a["name"].as_str()?.to_string();
                    let artist_name = a["artist"]["name"].as_str().unwrap_or_default().to_string();
                    let url = a["url"].as_str().unwrap_or_default().to_string();

                    let image_url = largest_image(a);

                    Some(DiscoverAlbum {
                        name,
                        artist_name,
                        image_url,
                        listeners: 0,
                        url,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(albums)
}

/// Search Last.fm for an album and return its artist name.
pub fn search_album_for_artist(query: &str) -> Result<String, String> {
    let json = crate::lastfm::api_get_public(&[
        ("method", "album.search"),
        ("album", query),
        ("limit", "1"),
    ])?;

    json["results"]["albummatches"]["album"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|a| a["artist"].as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("No results for '{}'", query))
}

/// Extract the largest available image URL from a Last.fm image array.
fn largest_image(item: &serde_json::Value) -> Option<String> {
    item["image"].as_array().and_then(|imgs| {
        imgs.iter().rev().find_map(|img| {
            let url = img["#text"].as_str().unwrap_or("");
            if url.is_empty() {
                None
            } else {
                Some(url.to_string())
            }
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn largest_image_picks_last_non_empty() {
        let item: serde_json::Value = serde_json::json!({
            "image": [
                {"#text": "http://small.jpg", "size": "small"},
                {"#text": "http://medium.jpg", "size": "medium"},
                {"#text": "", "size": "large"},
                {"#text": "http://extralarge.jpg", "size": "extralarge"},
            ]
        });
        assert_eq!(
            largest_image(&item),
            Some("http://extralarge.jpg".to_string())
        );
    }

    #[test]
    fn largest_image_returns_none_when_all_empty() {
        let item: serde_json::Value = serde_json::json!({
            "image": [
                {"#text": "", "size": "small"},
                {"#text": "", "size": "large"},
            ]
        });
        assert_eq!(largest_image(&item), None);
    }

    #[test]
    fn largest_image_returns_none_without_array() {
        let item: serde_json::Value = serde_json::json!({"name": "test"});
        assert_eq!(largest_image(&item), None);
    }
}
