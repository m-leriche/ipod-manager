mod browsing;
mod lists;
mod media;
mod system;

pub use browsing::{get_album, get_artist, get_artists, get_indexes, get_song};
pub use lists::{get_album_list2, get_genres, get_playlist, get_playlists, search3};
pub use media::{get_cover_art, stream};
pub use system::{get_license, get_music_directory, get_music_folders, get_user, ping};

use std::collections::HashMap;

use crate::library;
use crate::subsonic::{StableIdCache, SubsonicState};

use super::xml;

/// Build the stable ID cache from the database. Called once, then reused
/// for all subsequent lookups during sync.
fn build_id_cache(conn: &rusqlite::Connection) -> Result<StableIdCache, String> {
    let artists = library::get_artists(conn)?;
    let albums = library::get_albums(conn, None)?;

    let mut artist_map = HashMap::with_capacity(artists.len());
    for a in &artists {
        artist_map.insert(stable_id("ar", &a.name), a.name.clone());
    }

    let mut album_map = HashMap::with_capacity(albums.len());
    let mut folder_map = HashMap::with_capacity(albums.len());
    for a in &albums {
        let key = format!("{}||{}", a.artist, a.name);
        let id = stable_id("al", &key);
        album_map.insert(id.clone(), (a.artist.clone(), a.name.clone()));
        folder_map.insert(id, a.folder_path.clone());
    }

    Ok(StableIdCache {
        artists: artist_map,
        albums: album_map,
        album_folders: folder_map,
    })
}

/// Populate the ID cache if empty (one-time cost), then run a lookup.
fn with_id_cache<T>(
    state: &SubsonicState,
    lookup: impl FnOnce(&StableIdCache) -> Option<T>,
) -> Result<Option<T>, String> {
    // Fast path: read lock
    {
        let cache = state.id_cache.read().map_err(|e| format!("Cache: {e}"))?;
        if let Some(c) = cache.as_ref() {
            return Ok(lookup(c));
        }
    }
    // Cache miss: build under write lock.
    // Another thread may have populated the cache between dropping the read
    // lock and acquiring the write lock — check again to avoid redundant work.
    let mut cache = state.id_cache.write().map_err(|e| format!("Cache: {e}"))?;
    if let Some(c) = cache.as_ref() {
        return Ok(lookup(c));
    }
    let conn = crate::subsonic::open_read_conn(&state.db_path)?;
    let new_cache = build_id_cache(&conn)?;
    let result = lookup(&new_cache);
    *cache = Some(new_cache);
    Ok(result)
}

/// Ensure the stable ID cache is populated, then look up an artist name.
fn cached_artist_name(state: &SubsonicState, artist_id: &str) -> Result<Option<String>, String> {
    with_id_cache(state, |c| c.artists.get(artist_id).cloned())
}

/// Ensure the stable ID cache is populated, then look up album artist+name.
fn cached_album_info(
    state: &SubsonicState,
    album_id: &str,
) -> Result<Option<(String, String)>, String> {
    with_id_cache(state, |c| c.albums.get(album_id).cloned())
}

/// Ensure the stable ID cache is populated, then look up album folder path.
pub fn cached_album_folder(
    state: &SubsonicState,
    album_id: &str,
) -> Result<Option<String>, String> {
    with_id_cache(state, |c| c.album_folders.get(album_id).cloned())
}

/// Look up an artist by stable ID and return (name, albums).
/// Shared between getArtist (ID3 mode) and getMusicDirectory (directory mode).
async fn fetch_artist_with_albums(
    state: &SubsonicState,
    artist_id: String,
) -> Result<(String, Vec<library::types::AlbumSummary>), String> {
    // Resolve artist name from cache (no full-table scan)
    let artist_name =
        cached_artist_name(state, &artist_id)?.ok_or_else(|| "Artist not found".to_string())?;

    let db_path = state.db_path.clone();
    let artist_for_query = artist_name.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<_, String> {
        let conn = crate::subsonic::open_read_conn(&db_path)?;
        library::get_albums(&conn, Some(&artist_for_query))
    })
    .await;
    match result {
        Ok(Ok(albums)) => Ok((artist_name, albums)),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("Internal error".to_string()),
    }
}

/// Look up an album by stable ID and return (artist, album_name, year, tracks).
/// Shared between getAlbum (ID3 mode) and getMusicDirectory (directory mode).
async fn fetch_album_with_tracks(
    state: &SubsonicState,
    album_id: String,
) -> Result<
    (
        String,
        String,
        Option<u32>,
        Vec<library::types::LibraryTrack>,
    ),
    String,
> {
    // Resolve artist+album names from cache (no full-table scan)
    let (artist_name, album_name) =
        cached_album_info(state, &album_id)?.ok_or_else(|| "Album not found".to_string())?;

    let db_path = state.db_path.clone();
    let artist = artist_name.clone();
    let album = album_name.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<_, String> {
        let conn = crate::subsonic::open_read_conn(&db_path)?;

        // Get year from a quick query
        let year: Option<u32> = conn
            .query_row(
                "SELECT MIN(year) FROM tracks WHERE (album_artist = ?1 OR artist = ?1) AND album = ?2",
                rusqlite::params![&artist, &album],
                |row| row.get(0),
            )
            .ok()
            .flatten();

        let filter = library::types::LibraryFilter {
            artist: Some(vec![artist]),
            album: Some(vec![album]),
            sort_by: Some("track_number".to_string()),
            sort_direction: Some("asc".to_string()),
            ..Default::default()
        };
        let tracks = library::get_tracks(&conn, &filter)?;
        Ok((year, tracks))
    })
    .await;
    match result {
        Ok(Ok((year, tracks))) => Ok((artist_name, album_name, year, tracks)),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("Internal error".to_string()),
    }
}

/// Helper: convert a `LibraryTrack` into a `<song>` or `<child>` XML element.
///
/// Includes both directory-mode attributes (`parent`) and ID3-mode attributes
/// (`albumId`, `artistId`) so clients using either browsing style can link
/// songs to their parent album/artist.
fn song_xml(tag: &str, t: &crate::library::types::LibraryTrack) -> String {
    let id = t.id.to_string();
    let title = t.title.as_deref().unwrap_or(&t.file_name);
    let artist = t.artist.as_deref().unwrap_or("");
    let album_artist = t.album_artist.as_deref().unwrap_or(artist);
    let album = t.album.as_deref().unwrap_or("");
    let duration = t.duration_secs as u64;
    let suffix = format_suffix(&t.format);
    let content_type = format_content_type(&t.format);

    // Generate parent IDs for both directory and ID3 browsing modes
    let artist_id = stable_id("ar", album_artist);
    let album_id = stable_id("al", &format!("{album_artist}||{album}"));

    let mut s = format!("<{tag}");
    s.push_str(&xml::attr("id", &id));
    s.push_str(&xml::attr("title", title));
    s.push_str(&xml::attr("artist", artist));
    s.push_str(&xml::attr("album", album));
    s.push_str(&format!(
        " duration=\"{duration}\" isDir=\"false\" type=\"music\""
    ));
    s.push_str(&xml::opt_attr("track", &t.track_number));
    s.push_str(&xml::attr("suffix", suffix));
    s.push_str(&format!(" coverArt=\"{id}\""));
    s.push_str(&xml::opt_attr("year", &t.year));
    s.push_str(&xml::opt_attr("genre", &t.genre));
    s.push_str(&xml::opt_attr("discNumber", &t.disc_number));
    s.push_str(&xml::opt_attr("bitRate", &t.bitrate_kbps));
    s.push_str(&xml::attr("contentType", content_type));
    s.push_str(&xml::attr("size", &t.file_size.to_string()));
    s.push_str(&xml::attr("path", &format!("{}/{}", artist, &t.file_name)));
    s.push_str(&xml::attr("parent", &album_id));
    s.push_str(&xml::attr("albumId", &album_id));
    s.push_str(&xml::attr("artistId", &artist_id));
    s.push_str("/>");
    s
}

fn format_suffix(format: &str) -> &str {
    match format.to_lowercase().as_str() {
        "flac" => "flac",
        "mp3" | "mpeg" => "mp3",
        "aac" | "m4a" | "mp4" | "alac" => "m4a",
        "ogg" | "vorbis" => "ogg",
        "wav" => "wav",
        "aiff" | "aif" => "aiff",
        "opus" => "opus",
        _ => "mp3",
    }
}

fn format_content_type(format: &str) -> &str {
    match format.to_lowercase().as_str() {
        "flac" => "audio/flac",
        "mp3" | "mpeg" => "audio/mpeg",
        "aac" | "m4a" | "mp4" | "alac" => "audio/mp4",
        "ogg" | "vorbis" => "audio/ogg",
        "wav" => "audio/wav",
        "aiff" | "aif" => "audio/aiff",
        "opus" => "audio/ogg",
        _ => "audio/mpeg",
    }
}

/// Helper: convert an `AlbumSummary` into an `<album>` XML element.
fn album_xml(album: &crate::library::types::AlbumSummary) -> String {
    let album_id = stable_id("al", &format!("{}||{}", album.artist, album.name));
    let artist_id = stable_id("ar", &album.artist);
    let mut s = String::from("<album");
    s.push_str(&xml::attr("id", &album_id));
    s.push_str(&xml::attr("name", &album.name));
    s.push_str(&xml::attr("artist", &album.artist));
    s.push_str(&xml::attr("artistId", &artist_id));
    s.push_str(&xml::opt_attr("year", &album.year));
    s.push_str(&format!(
        " songCount=\"{}\" duration=\"0\"",
        album.track_count
    ));
    s.push_str(&xml::attr("coverArt", &album_id));
    s.push_str("/>");
    s
}

/// Generate a stable numeric ID from a string (for artists/albums that
/// don't have database IDs).
///
/// Uses 4 bytes of MD5 → u32 space (~4 billion values). Birthday paradox
/// gives ~50% collision chance at ~77K entries — fine for typical libraries.
pub fn stable_id(prefix: &str, name: &str) -> String {
    let hash = md5::compute(name.as_bytes());
    let bytes: [u8; 4] = hash[..4].try_into().expect("md5 is 16 bytes");
    let id = u32::from_le_bytes(bytes);
    format!("{prefix}{id}")
}

/// XML response with correct content-type header.
pub fn xml_response(body: String) -> axum::response::Response {
    use axum::response::IntoResponse;
    (
        [(
            axum::http::header::CONTENT_TYPE,
            "application/xml; charset=UTF-8",
        )],
        body,
    )
        .into_response()
}
