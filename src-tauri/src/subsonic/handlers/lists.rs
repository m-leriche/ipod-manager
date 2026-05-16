use std::sync::Arc;

use axum::extract::{Query, State};

use super::{song_xml, stable_id, xml, xml_response};
use crate::library;
use crate::subsonic::SubsonicState;

/// GET /rest/getGenres — list all genres with song/album counts.
pub async fn get_genres(State(state): State<Arc<SubsonicState>>) -> axum::response::Response {
    let db_path = state.db_path.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<_, String> {
        let conn = crate::subsonic::open_read_conn(&db_path)?;
        library::get_genres(&conn)
    })
    .await;

    let genres = match result {
        Ok(Ok(g)) => g,
        _ => return xml_response(xml::error_response(0, "Internal error")),
    };

    let mut inner = String::from("<genres>");
    for genre in &genres {
        inner.push_str(&format!(
            "<genre songCount=\"{}\" albumCount=\"0\">{}</genre>",
            genre.track_count,
            xml::escape(&genre.name),
        ));
    }
    inner.push_str("</genres>");

    xml_response(xml::ok_response(&inner))
}

#[derive(serde::Deserialize)]
pub struct PlaylistIdParam {
    pub id: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct AlbumListParams {
    #[serde(rename = "type")]
    pub list_type: Option<String>,
    pub size: Option<usize>,
    pub offset: Option<usize>,
}

#[derive(serde::Deserialize)]
pub struct SearchParams {
    pub query: Option<String>,
    #[serde(rename = "songCount")]
    pub song_count: Option<usize>,
    #[serde(rename = "albumCount")]
    pub album_count: Option<usize>,
    #[serde(rename = "artistCount")]
    pub artist_count: Option<usize>,
}

/// GET /rest/getAlbumList2 — list albums by type (newest, recent, frequent, random, etc.)
pub async fn get_album_list2(
    State(state): State<Arc<SubsonicState>>,
    Query(params): Query<AlbumListParams>,
) -> axum::response::Response {
    let list_type = params
        .list_type
        .unwrap_or_else(|| "alphabeticalByName".to_string());
    let size = params.size.unwrap_or(20).min(500);
    let offset = params.offset.unwrap_or(0);

    let db_path = state.db_path.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<_, String> {
        let conn = crate::subsonic::open_read_conn(&db_path)?;
        library::get_albums_sorted(&conn, &list_type, size, offset)
    })
    .await;

    let albums = match result {
        Ok(Ok(a)) => a,
        _ => return xml_response(xml::error_response(0, "Internal error")),
    };

    let mut inner = String::from("<albumList2>");
    for album in &albums {
        inner.push_str(&super::album_xml(album));
    }
    inner.push_str("</albumList2>");

    xml_response(xml::ok_response(&inner))
}

/// GET /rest/search3 — search across artists, albums, and songs.
pub async fn search3(
    State(state): State<Arc<SubsonicState>>,
    Query(params): Query<SearchParams>,
) -> axum::response::Response {
    let query = params.query.unwrap_or_default();
    let max_songs = params.song_count.unwrap_or(20).min(100);
    let max_albums = params.album_count.unwrap_or(20).min(100);
    let max_artists = params.artist_count.unwrap_or(20).min(100);

    if query.is_empty() {
        return xml_response(xml::ok_response("<searchResult3></searchResult3>"));
    }

    let db_path = state.db_path.clone();
    let query_clone = query.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<_, String> {
        let conn = crate::subsonic::open_read_conn(&db_path)?;

        let artists = library::search_artists(&conn, &query_clone, max_artists)?;
        let albums = library::search_albums(&conn, &query_clone, max_albums)?;

        let filter = library::types::LibraryFilter {
            search: Some(query_clone),
            limit: Some(max_songs),
            ..Default::default()
        };
        let tracks = library::get_tracks_paginated(&conn, &filter)?.tracks;

        Ok((artists, albums, tracks))
    })
    .await;

    let (artists, albums, tracks) = match result {
        Ok(Ok(data)) => data,
        _ => return xml_response(xml::error_response(0, "Internal error")),
    };

    let mut inner = String::from("<searchResult3>");

    for artist in &artists {
        let id = stable_id("ar", &artist.name);
        inner.push_str(&format!(
            "<artist{}{} albumCount=\"{}\"/>",
            xml::attr("id", &id),
            xml::attr("name", &artist.name),
            artist.album_count,
        ));
    }

    for album in &albums {
        inner.push_str(&super::album_xml(album));
    }

    for track in &tracks {
        inner.push_str(&super::song_xml("song", track));
    }

    inner.push_str("</searchResult3>");

    xml_response(xml::ok_response(&inner))
}

/// GET /rest/getPlaylists — list all playlists.
pub async fn get_playlists(State(state): State<Arc<SubsonicState>>) -> axum::response::Response {
    let db_path = state.db_path.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<_, String> {
        let conn = crate::subsonic::open_read_conn(&db_path)?;
        library::playlists::get_playlists(&conn)
    })
    .await;

    let playlists = match result {
        Ok(Ok(p)) => p,
        _ => return xml_response(xml::error_response(0, "Internal error")),
    };

    let mut inner = String::from("<playlists>");
    for pl in &playlists {
        inner.push_str(&format!(
            "<playlist{}{} songCount=\"{}\" duration=\"{}\" owner=\"admin\" public=\"false\"/>",
            xml::attr("id", &pl.id.to_string()),
            xml::attr("name", &pl.name),
            pl.track_count,
            pl.total_duration as u64,
        ));
    }
    inner.push_str("</playlists>");

    xml_response(xml::ok_response(&inner))
}

/// GET /rest/getPlaylist — get a single playlist with its tracks.
pub async fn get_playlist(
    State(state): State<Arc<SubsonicState>>,
    Query(params): Query<PlaylistIdParam>,
) -> axum::response::Response {
    let Some(id_str) = params.id else {
        return xml_response(xml::error_response(
            xml::error_codes::MISSING_PARAMETER,
            "Missing id parameter",
        ));
    };

    let playlist_id: i64 = match id_str.parse() {
        Ok(id) => id,
        Err(_) => {
            return xml_response(xml::error_response(
                xml::error_codes::NOT_FOUND,
                "Invalid playlist id",
            ))
        }
    };

    let db_path = state.db_path.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<_, String> {
        let conn = crate::subsonic::open_read_conn(&db_path)?;

        // Get playlist metadata
        let playlists = library::playlists::get_playlists(&conn)?;
        let playlist = playlists
            .into_iter()
            .find(|p| p.id == playlist_id)
            .ok_or_else(|| "Playlist not found".to_string())?;

        let tracks = library::playlists::get_playlist_tracks(&conn, playlist_id)?;
        Ok((playlist, tracks))
    })
    .await;

    let (playlist, tracks) = match result {
        Ok(Ok(data)) => data,
        Ok(Err(e)) => return xml_response(xml::error_response(xml::error_codes::NOT_FOUND, &e)),
        Err(_) => return xml_response(xml::error_response(0, "Internal error")),
    };

    let total_duration: u64 = tracks.iter().map(|pt| pt.track.duration_secs as u64).sum();

    let mut inner = format!(
        "<playlist{}{} songCount=\"{}\" duration=\"{}\" owner=\"admin\" public=\"false\">",
        xml::attr("id", &playlist.id.to_string()),
        xml::attr("name", &playlist.name),
        tracks.len(),
        total_duration,
    );

    for pt in &tracks {
        inner.push_str(&song_xml("entry", &pt.track));
    }
    inner.push_str("</playlist>");

    xml_response(xml::ok_response(&inner))
}
