use std::sync::Arc;

use axum::extract::{Query, State};

use super::{song_xml, stable_id, xml, xml_response};
use crate::library;
use crate::subsonic::SubsonicState;

/// GET /rest/getGenres — list all genres with song/album counts.
pub async fn get_genres(State(state): State<Arc<SubsonicState>>) -> axum::response::Response {
    let db = state.db.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<_, String> {
        let conn = db.lock().map_err(|e| format!("DB lock: {e}"))?;
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

    let db = state.db.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<_, String> {
        let conn = db.lock().map_err(|e| format!("DB lock: {e}"))?;
        let albums = library::get_albums(&conn, None)?;
        Ok(albums)
    })
    .await;

    let mut albums = match result {
        Ok(Ok(a)) => a,
        _ => return xml_response(xml::error_response(0, "Internal error")),
    };

    // Sort by requested type
    match list_type.as_str() {
        "newest" | "recent" => {
            // Sort by year descending; albums without a year go last
            albums.sort_by(|a, b| b.year.unwrap_or(0).cmp(&a.year.unwrap_or(0)));
        }
        "random" => {
            // Fisher-Yates shuffle
            let len = albums.len();
            for i in (1..len).rev() {
                albums.swap(i, fastrand::usize(..=i));
            }
        }
        "alphabeticalByArtist" => albums.sort_by_key(|a| a.artist.to_lowercase()),
        // "alphabeticalByName" is the default sort from the DB
        _ => {}
    }

    // Paginate
    let page: Vec<_> = albums.into_iter().skip(offset).take(size).collect();

    let mut inner = String::from("<albumList2>");
    for album in &page {
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

    let query_clone = query.clone();
    let db = state.db.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<_, String> {
        let conn = db.lock().map_err(|e| format!("DB lock: {e}"))?;

        let tracks = library::search_tracks(&conn, &query_clone)?;
        let artists = library::get_artists(&conn)?;
        let albums = library::get_albums(&conn, None)?;

        Ok((tracks, artists, albums))
    })
    .await;

    let (tracks, artists, albums) = match result {
        Ok(Ok(data)) => data,
        _ => return xml_response(xml::error_response(0, "Internal error")),
    };

    let query_lower = query.to_lowercase();

    let mut inner = String::from("<searchResult3>");

    // Matching artists
    let mut artist_count = 0;
    for artist in &artists {
        if artist_count >= max_artists {
            break;
        }
        if artist.name.to_lowercase().contains(&query_lower) {
            let id = stable_id("ar", &artist.name);
            inner.push_str(&format!(
                "<artist{}{} albumCount=\"{}\"/>",
                xml::attr("id", &id),
                xml::attr("name", &artist.name),
                artist.album_count,
            ));
            artist_count += 1;
        }
    }

    // Matching albums
    let mut album_count = 0;
    for album in &albums {
        if album_count >= max_albums {
            break;
        }
        if album.name.to_lowercase().contains(&query_lower)
            || album.artist.to_lowercase().contains(&query_lower)
        {
            inner.push_str(&super::album_xml(album));
            album_count += 1;
        }
    }

    // Matching songs
    for track in tracks.iter().take(max_songs) {
        inner.push_str(&super::song_xml("song", track));
    }

    inner.push_str("</searchResult3>");

    xml_response(xml::ok_response(&inner))
}

/// GET /rest/getPlaylists — list all playlists.
pub async fn get_playlists(State(state): State<Arc<SubsonicState>>) -> axum::response::Response {
    let db = state.db.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<_, String> {
        let conn = db.lock().map_err(|e| format!("DB lock: {e}"))?;
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

    let db = state.db.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<_, String> {
        let conn = db.lock().map_err(|e| format!("DB lock: {e}"))?;

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
