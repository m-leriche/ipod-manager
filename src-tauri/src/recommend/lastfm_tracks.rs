//! Track-level recommendations via Last.fm `track.getSimilar`.
//! Uses the unsigned public endpoint, so no user session is required.

/// A track suggestion returned by Last.fm `track.getSimilar`.
#[derive(Debug, Clone)]
pub struct SimilarTrack {
    pub artist: String,
    pub title: String,
    pub image_url: Option<String>,
    pub score: f64,
}

/// Fetch tracks similar to `artist` / `track` from Last.fm.
pub fn fetch_similar_tracks(
    artist: &str,
    track: &str,
    limit: u32,
) -> Result<Vec<SimilarTrack>, String> {
    let limit_str = limit.to_string();
    let json = crate::lastfm::api_get_public(&[
        ("method", "track.getSimilar"),
        ("artist", artist),
        ("track", track),
        ("limit", &limit_str),
        ("autocorrect", "1"),
    ])?;

    Ok(parse_similar_tracks(&json))
}

fn parse_similar_tracks(json: &serde_json::Value) -> Vec<SimilarTrack> {
    json["similartracks"]["track"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|t| {
                    let title = t["name"].as_str()?.trim().to_string();
                    let artist = t["artist"]["name"].as_str()?.trim().to_string();
                    if title.is_empty() || artist.is_empty() {
                        return None;
                    }
                    let score = t["match"]
                        .as_f64()
                        .or_else(|| t["match"].as_str().and_then(|s| s.parse().ok()))
                        .unwrap_or(0.0);
                    Some(SimilarTrack {
                        artist,
                        title,
                        image_url: largest_image(t),
                        score,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
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
    fn parses_similar_tracks_and_skips_blank_names() {
        let json = serde_json::json!({
            "similartracks": {
                "track": [
                    {
                        "name": "Karma Police",
                        "artist": {"name": "Radiohead"},
                        "match": "0.95",
                        "image": [{"#text": "http://s.jpg", "size": "small"},
                                   {"#text": "http://l.jpg", "size": "large"}],
                    },
                    {
                        "name": "",
                        "artist": {"name": "Nobody"},
                        "match": 0.5,
                    },
                    {
                        "name": "Numeric Match",
                        "artist": {"name": "Band"},
                        "match": 0.42,
                    },
                ]
            }
        });

        let tracks = parse_similar_tracks(&json);
        assert_eq!(tracks.len(), 2);
        assert_eq!(tracks[0].title, "Karma Police");
        assert_eq!(tracks[0].artist, "Radiohead");
        assert_eq!(tracks[0].image_url.as_deref(), Some("http://l.jpg"));
        assert!((tracks[0].score - 0.95).abs() < f64::EPSILON);
        assert!((tracks[1].score - 0.42).abs() < f64::EPSILON);
        assert!(tracks[1].image_url.is_none());
    }

    #[test]
    fn returns_empty_when_no_tracks() {
        let json = serde_json::json!({"similartracks": {}});
        assert!(parse_similar_tracks(&json).is_empty());
    }
}
