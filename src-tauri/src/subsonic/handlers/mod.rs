mod browsing;
mod lists;
mod media;
mod system;

pub use browsing::{get_album, get_artist, get_artists, get_indexes, get_song};
pub use lists::{get_album_list2, get_genres, get_playlist, get_playlists, search3};
pub use media::{get_cover_art, stream};
pub use system::{get_license, get_music_directory, get_music_folders, get_user, ping};

use super::xml;

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
    s.push_str(&format!(" duration=\"{duration}\" isDir=\"false\" type=\"music\""));
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
