use std::sync::Arc;

use axum::extract::{Query, State};

use super::{song_xml, stable_id, xml, xml_response};
use crate::library;
use crate::subsonic::SubsonicState;

/// GET /rest/ping — server health check.
pub async fn ping() -> axum::response::Response {
    xml_response(xml::ok_response(""))
}

/// GET /rest/getLicense — always returns a valid license.
pub async fn get_license() -> axum::response::Response {
    xml_response(xml::ok_response(
        "<license valid=\"true\" email=\"crate@local\" licenseExpires=\"2099-12-31T00:00:00\"/>",
    ))
}

/// GET /rest/getMusicFolders — returns the library root folder(s).
/// Required by most Subsonic clients during initial connection.
pub async fn get_music_folders(
    State(state): State<Arc<SubsonicState>>,
) -> axum::response::Response {
    let db_path = state.db_path.clone();
    let result = tokio::task::spawn_blocking(
        move || -> Result<Vec<library::types::LibraryFolder>, String> {
            let conn = crate::subsonic::open_read_conn(&db_path)?;
            library::get_folders(&conn)
        },
    )
    .await;

    let folders = match result {
        Ok(Ok(f)) => f,
        _ => vec![],
    };

    let mut inner = String::from("<musicFolders>");
    if folders.is_empty() {
        inner.push_str("<musicFolder id=\"1\" name=\"Music\"/>");
    } else {
        for (i, folder) in folders.iter().enumerate() {
            let name = std::path::Path::new(&folder.path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Music");
            inner.push_str(&format!(
                "<musicFolder id=\"{}\" name=\"{}\"/>",
                i + 1,
                xml::escape(name),
            ));
        }
    }
    inner.push_str("</musicFolders>");

    xml_response(xml::ok_response(&inner))
}

/// GET /rest/getUser — returns info about the current user.
pub async fn get_user(State(state): State<Arc<SubsonicState>>) -> axum::response::Response {
    let username = &state.username;
    let inner = format!(
        "<user{} email=\"\" scrobblingEnabled=\"true\" adminRole=\"true\" \
         settingsRole=\"true\" downloadRole=\"true\" uploadRole=\"false\" \
         playlistRole=\"true\" coverArtRole=\"true\" commentRole=\"false\" \
         podcastRole=\"false\" streamRole=\"true\" jukeboxRole=\"false\" \
         shareRole=\"false\" videoConversionRole=\"false\" \
         maxBitRate=\"0\"/>",
        xml::attr("username", username),
    );
    xml_response(xml::ok_response(&inner))
}

#[derive(serde::Deserialize)]
pub struct DirParams {
    pub id: Option<String>,
}

/// GET /rest/getMusicDirectory — browse a folder by ID.
/// Amperfy and other clients use this instead of getArtist/getAlbum.
/// - Artist ID (`ar...`) → returns that artist's albums as `<child>` elements
/// - Album ID (`al...`) → returns that album's songs as `<child>` elements
pub async fn get_music_directory(
    State(state): State<Arc<SubsonicState>>,
    Query(params): Query<DirParams>,
) -> axum::response::Response {
    let id = match params.id {
        Some(id) => id,
        None => {
            return xml_response(xml::error_response(
                xml::error_codes::MISSING_PARAMETER,
                "Missing id parameter",
            ))
        }
    };

    if id.starts_with("ar") {
        get_artist_directory(&state, &id).await
    } else if id.starts_with("al") {
        get_album_directory(&state, &id).await
    } else {
        // Numeric ID = music folder root → return all artists as directories
        get_root_directory(&state, &id).await
    }
}

async fn get_artist_directory(state: &SubsonicState, artist_id: &str) -> axum::response::Response {
    let (name, albums) = match super::fetch_artist_with_albums(state, artist_id.to_string()).await {
        Ok(data) => data,
        Err(e) => return xml_response(xml::error_response(xml::error_codes::NOT_FOUND, &e)),
    };

    let mut inner = format!(
        "<directory{}{}>",
        xml::attr("id", &stable_id("ar", &name)),
        xml::attr("name", &name),
    );
    for album in &albums {
        let album_id = stable_id("al", &format!("{}||{}", album.artist, album.name));
        inner.push_str(&format!(
            "<child{}{}{} isDir=\"true\"{} coverArt=\"{}\"/>",
            xml::attr("id", &album_id),
            xml::attr("title", &album.name),
            xml::attr("artist", &album.artist),
            xml::opt_attr("year", &album.year),
            album_id,
        ));
    }
    inner.push_str("</directory>");

    xml_response(xml::ok_response(&inner))
}

async fn get_album_directory(state: &SubsonicState, album_id: &str) -> axum::response::Response {
    let (artist_name, album_name, _year, tracks) =
        match super::fetch_album_with_tracks(state, album_id.to_string()).await {
            Ok(data) => data,
            Err(e) => return xml_response(xml::error_response(xml::error_codes::NOT_FOUND, &e)),
        };

    let dir_id = stable_id("al", &format!("{artist_name}||{album_name}"));
    let parent_id = stable_id("ar", &artist_name);
    let mut inner = format!(
        "<directory{}{} parent=\"{parent_id}\">",
        xml::attr("id", &dir_id),
        xml::attr("name", &album_name),
    );
    for track in &tracks {
        inner.push_str(&song_xml("child", track));
    }
    inner.push_str("</directory>");

    xml_response(xml::ok_response(&inner))
}

/// Music folder root → return all artists as child directories.
async fn get_root_directory(state: &SubsonicState, folder_id: &str) -> axum::response::Response {
    let db_path = state.db_path.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<_, String> {
        let conn = crate::subsonic::open_read_conn(&db_path)?;
        library::get_artists(&conn)
    })
    .await;

    let artists = match result {
        Ok(Ok(a)) => a,
        _ => return xml_response(xml::error_response(0, "Internal error")),
    };

    let mut inner = format!(
        "<directory{}{}>",
        xml::attr("id", folder_id),
        xml::attr("name", "Music"),
    );
    for artist in &artists {
        let id = stable_id("ar", &artist.name);
        inner.push_str(&format!(
            "<child{}{} isDir=\"true\" parent=\"{}\"/>",
            xml::attr("id", &id),
            xml::attr("title", &artist.name),
            xml::escape(folder_id),
        ));
    }
    inner.push_str("</directory>");

    xml_response(xml::ok_response(&inner))
}
