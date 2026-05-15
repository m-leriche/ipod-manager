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
fn build_artist_index(artists: &[library::types::ArtistSummary], wrapper_tag: &str) -> String {
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
        library::get_track_by_id(&conn, track_id)
    })
    .await;

    let track = match result {
        Ok(Ok(t)) => t,
        Ok(Err(e)) => return xml_response(xml::error_response(xml::error_codes::NOT_FOUND, &e)),
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

    let (artist_name, albums) = match super::fetch_artist_with_albums(&state, artist_id).await {
        Ok(data) => data,
        Err(e) => return xml_response(xml::error_response(xml::error_codes::NOT_FOUND, &e)),
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

    let (artist_name, album_name, year, tracks) =
        match super::fetch_album_with_tracks(&state, album_id.clone()).await {
            Ok(data) => data,
            Err(e) => return xml_response(xml::error_response(xml::error_codes::NOT_FOUND, &e)),
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
