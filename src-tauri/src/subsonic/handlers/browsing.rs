use std::collections::BTreeMap;
use std::sync::Arc;

use axum::extract::{Query, State};

use super::{song_xml, stable_id, xml, xml_response};
use crate::library;
use crate::subsonic::SubsonicState;

#[derive(serde::Deserialize)]
pub struct IdParam {
    pub id: Option<String>,
}

/// Build the artist index XML (shared by getArtists and getIndexes).
fn build_artist_index(
    artists: &[library::types::ArtistSummary],
    wrapper_tag: &str,
) -> String {
    let mut index_map: BTreeMap<char, Vec<&library::types::ArtistSummary>> = BTreeMap::new();
    for artist in artists {
        let first = artist
            .name
            .chars()
            .next()
            .map(|c| {
                let upper = c.to_uppercase().next().unwrap_or(c);
                if upper.is_ascii_alphabetic() {
                    upper
                } else {
                    '#'
                }
            })
            .unwrap_or('#');
        index_map.entry(first).or_default().push(artist);
    }

    let mut inner = format!("<{wrapper_tag}>");
    for (letter, group) in &index_map {
        inner.push_str(&format!("<index name=\"{letter}\">"));
        for artist in group {
            let id = stable_id("ar", &artist.name);
            inner.push_str(&format!(
                "<artist{}{} albumCount=\"{}\"/>",
                xml::attr("id", &id),
                xml::attr("name", &artist.name),
                artist.album_count,
            ));
        }
        inner.push_str("</index>");
    }
    inner.push_str(&format!("</{wrapper_tag}>"));
    inner
}

async fn fetch_artists(state: &SubsonicState) -> Result<Vec<library::types::ArtistSummary>, ()> {
    let db = state.db.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<_, String> {
        let conn = db.lock().map_err(|e| format!("DB lock: {e}"))?;
        library::get_artists(&conn)
    })
    .await;
    match result {
        Ok(Ok(a)) => Ok(a),
        _ => Err(()),
    }
}

/// GET /rest/getArtists — list all artists grouped by first letter (ID3 mode).
pub async fn get_artists(State(state): State<Arc<SubsonicState>>) -> axum::response::Response {
    let artists = match fetch_artists(&state).await {
        Ok(a) => a,
        Err(()) => return xml_response(xml::error_response(0, "Internal error")),
    };
    xml_response(xml::ok_response(&build_artist_index(&artists, "artists")))
}

/// GET /rest/getIndexes — list all artists grouped by first letter (non-ID3 mode).
/// Many clients (including Amperfy) use this instead of getArtists.
pub async fn get_indexes(State(state): State<Arc<SubsonicState>>) -> axum::response::Response {
    let artists = match fetch_artists(&state).await {
        Ok(a) => a,
        Err(()) => return xml_response(xml::error_response(0, "Internal error")),
    };
    xml_response(xml::ok_response(&build_artist_index(&artists, "indexes")))
}

/// GET /rest/getSong — get a single song by ID.
pub async fn get_song(
    State(state): State<Arc<SubsonicState>>,
    Query(params): Query<IdParam>,
) -> axum::response::Response {
    let Some(id_str) = params.id else {
        return xml_response(xml::error_response(
            xml::error_codes::MISSING_PARAMETER,
            "Missing id parameter",
        ));
    };

    let track_id: i64 = match id_str.parse() {
        Ok(id) => id,
        Err(_) => {
            return xml_response(xml::error_response(
                xml::error_codes::NOT_FOUND,
                "Invalid song id",
            ))
        }
    };

    let db = state.db.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<_, String> {
        let conn = db.lock().map_err(|e| format!("DB lock: {e}"))?;
        let filter = library::types::LibraryFilter {
            artist: None,
            album: None,
            genre: None,
            search: None,
            sort_by: None,
            sort_direction: None,
            flagged_only: None,
            rating_min: None,
            rating_max: None,
            offset: None,
            limit: None,
            skip_count: None,
        };
        let tracks = library::get_tracks(&conn, &filter)?;
        tracks
            .into_iter()
            .find(|t| t.id == track_id)
            .ok_or_else(|| "Song not found".to_string())
    })
    .await;

    let track = match result {
        Ok(Ok(t)) => t,
        Ok(Err(e)) => {
            return xml_response(xml::error_response(xml::error_codes::NOT_FOUND, &e))
        }
        Err(_) => return xml_response(xml::error_response(0, "Internal error")),
    };

    xml_response(xml::ok_response(&song_xml("song", &track)))
}

/// GET /rest/getArtist — get an artist's albums.
pub async fn get_artist(
    State(state): State<Arc<SubsonicState>>,
    Query(params): Query<IdParam>,
) -> axum::response::Response {
    let Some(artist_id) = params.id else {
        return xml_response(xml::error_response(
            xml::error_codes::MISSING_PARAMETER,
            "Missing id parameter",
        ));
    };

    let db = state.db.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<_, String> {
        let conn = db.lock().map_err(|e| format!("DB lock: {e}"))?;

        // Find artist name by matching the stable ID
        let artists = library::get_artists(&conn)?;
        let artist = artists
            .iter()
            .find(|a| stable_id("ar", &a.name) == artist_id);

        let Some(artist) = artist else {
            return Err("Artist not found".to_string());
        };

        let artist_name = artist.name.clone();
        let albums = library::get_albums(&conn, Some(&artist_name))?;
        Ok((artist_name, albums))
    })
    .await;

    let (artist_name, albums) = match result {
        Ok(Ok(data)) => data,
        Ok(Err(e)) => {
            return xml_response(xml::error_response(xml::error_codes::NOT_FOUND, &e))
        }
        Err(_) => return xml_response(xml::error_response(0, "Internal error")),
    };

    let artist_id_str = stable_id("ar", &artist_name);
    let mut inner = format!(
        "<artist{}{} albumCount=\"{}\">",
        xml::attr("id", &artist_id_str),
        xml::attr("name", &artist_name),
        albums.len(),
    );

    for album in &albums {
        inner.push_str(&super::album_xml(album));
    }
    inner.push_str("</artist>");

    xml_response(xml::ok_response(&inner))
}

/// GET /rest/getAlbum — get an album's tracks.
pub async fn get_album(
    State(state): State<Arc<SubsonicState>>,
    Query(params): Query<IdParam>,
) -> axum::response::Response {
    let Some(album_id) = params.id else {
        return xml_response(xml::error_response(
            xml::error_codes::MISSING_PARAMETER,
            "Missing id parameter",
        ));
    };

    let db = state.db.clone();
    let album_id_clone = album_id.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<_, String> {
        let conn = db.lock().map_err(|e| format!("DB lock: {e}"))?;

        // Find the album by matching stable IDs against all albums
        let all_albums = library::get_albums(&conn, None)?;
        let album = all_albums
            .iter()
            .find(|a| stable_id("al", &format!("{}||{}", a.artist, a.name)) == album_id_clone);

        let Some(album) = album else {
            return Err("Album not found".to_string());
        };

        let artist_name = album.artist.clone();
        let album_name = album.name.clone();
        let year = album.year;

        // Get tracks for this specific album + artist
        let filter = library::types::LibraryFilter {
            artist: Some(vec![artist_name.clone()]),
            album: Some(vec![album_name.clone()]),
            genre: None,
            search: None,
            sort_by: Some("track_number".to_string()),
            sort_direction: Some("asc".to_string()),
            flagged_only: None,
            rating_min: None,
            rating_max: None,
            offset: None,
            limit: None,
            skip_count: None,
        };

        let tracks = library::get_tracks(&conn, &filter)?;
        Ok((artist_name, album_name, year, tracks))
    })
    .await;

    let (artist_name, album_name, year, tracks) = match result {
        Ok(Ok(data)) => data,
        Ok(Err(e)) => {
            return xml_response(xml::error_response(xml::error_codes::NOT_FOUND, &e))
        }
        Err(_) => return xml_response(xml::error_response(0, "Internal error")),
    };

    let total_duration: u64 = tracks.iter().map(|t| t.duration_secs as u64).sum();

    let artist_id_str = stable_id("ar", &artist_name);
    let mut inner = format!(
        "<album{}{}{}{}{} songCount=\"{}\" duration=\"{}\" coverArt=\"{}\">",
        xml::attr("id", &album_id),
        xml::attr("name", &album_name),
        xml::attr("artist", &artist_name),
        xml::attr("artistId", &artist_id_str),
        xml::opt_attr("year", &year),
        tracks.len(),
        total_duration,
        album_id,
    );

    for track in &tracks {
        inner.push_str(&song_xml("song", track));
    }
    inner.push_str("</album>");

    xml_response(xml::ok_response(&inner))
}
