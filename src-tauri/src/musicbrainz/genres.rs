//! Release-group genre lookup. Genres are community-voted tags filtered
//! against MusicBrainz's curated genre list; `count` is the net vote count.

use serde::Serialize;

use super::{call_with_retry, BASE_URL, USER_AGENT};

#[derive(Debug, Clone, Serialize)]
pub struct MbGenre {
    pub name: String,
    pub count: u64,
}

/// Fetch the voted genres for a release group by MBID.
pub fn fetch_release_group_genres(mbid: &str) -> Result<Vec<MbGenre>, String> {
    let req = ureq::get(&format!("{}/release-group/{}", BASE_URL, mbid))
        .query("inc", "genres")
        .query("fmt", "json")
        .set("User-Agent", USER_AGENT);
    let resp = call_with_retry(req).map_err(|e| format!("Genre lookup failed: {}", e))?;

    let text = resp
        .into_string()
        .map_err(|e| format!("Read failed: {}", e))?;
    let body: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("Parse failed: {}", e))?;

    Ok(parse_genres(&body))
}

pub(super) fn parse_genres(body: &serde_json::Value) -> Vec<MbGenre> {
    body["genres"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|g| {
                    let name = g["name"].as_str()?.to_string();
                    let count = g["count"].as_u64().unwrap_or(0);
                    Some(MbGenre { name, count })
                })
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_genres_from_release_group_response() {
        let body: serde_json::Value = serde_json::from_str(
            r#"{"id":"x","genres":[{"name":"grunge","count":12},{"name":"rock","count":30}]}"#,
        )
        .unwrap();
        let genres = parse_genres(&body);
        assert_eq!(genres.len(), 2);
        assert_eq!(genres[0].name, "grunge");
        assert_eq!(genres[0].count, 12);
    }

    #[test]
    fn missing_genres_field_yields_empty() {
        let body: serde_json::Value = serde_json::from_str(r#"{"id":"x"}"#).unwrap();
        assert!(parse_genres(&body).is_empty());
    }
}
