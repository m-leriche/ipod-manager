use std::path::Path;
use std::sync::Arc;

use axum::body::Body;
use axum::extract::{Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;

use super::{xml, xml_response};
use crate::subsonic::SubsonicState;
use crate::thumbnail::{self, ThumbSize};

#[derive(serde::Deserialize)]
pub struct StreamParams {
    pub id: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct CoverArtParams {
    pub id: Option<String>,
    pub size: Option<u32>,
}

/// GET /rest/stream — stream an audio file by track ID.
pub async fn stream(
    State(state): State<Arc<SubsonicState>>,
    Query(params): Query<StreamParams>,
    headers: HeaderMap,
) -> Response {
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
                "Invalid track id",
            ))
        }
    };

    let db_path = state.db_path.clone();
    let file_path = tokio::task::spawn_blocking(move || -> Result<_, String> {
        let conn = crate::subsonic::open_read_conn(&db_path)?;
        conn.query_row(
            "SELECT file_path FROM tracks WHERE id = ?1",
            rusqlite::params![track_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|_| "Track not found".to_string())
    })
    .await;

    let file_path = match file_path {
        Ok(Ok(p)) => p,
        _ => {
            return xml_response(xml::error_response(
                xml::error_codes::NOT_FOUND,
                "Track not found",
            ))
        }
    };

    serve_file(&file_path, &headers).await
}

/// GET /rest/getCoverArt — serve album artwork by ID.
///
/// The `id` can be a track ID (numeric) or an album ID (`al...`).
/// For tracks, we look up the folder_path and find cover art there.
/// For albums, we look for any track matching the album and use its folder.
pub async fn get_cover_art(
    State(state): State<Arc<SubsonicState>>,
    headers: HeaderMap,
    Query(params): Query<CoverArtParams>,
) -> Response {
    let Some(id_str) = params.id else {
        return (StatusCode::NOT_FOUND, "Missing id").into_response();
    };

    let folder_path = if let Ok(track_id) = id_str.parse::<i64>() {
        // Numeric ID → look up track's folder directly
        let db_path = state.db_path.clone();
        let result = tokio::task::spawn_blocking(move || -> Result<_, String> {
            let conn = crate::subsonic::open_read_conn(&db_path)?;
            conn.query_row(
                "SELECT folder_path FROM tracks WHERE id = ?1",
                rusqlite::params![track_id],
                |row| row.get::<_, String>(0),
            )
            .map_err(|_| "Not found".to_string())
        })
        .await;
        match result {
            Ok(Ok(p)) => p,
            _ => return (StatusCode::NOT_FOUND, "Cover art not found").into_response(),
        }
    } else if id_str.starts_with("al") {
        // Album ID → resolve folder from cache (no full-table scan)
        match super::cached_album_folder(&state, &id_str) {
            Ok(Some(f)) => f,
            _ => return (StatusCode::NOT_FOUND, "Cover art not found").into_response(),
        }
    } else {
        return (StatusCode::NOT_FOUND, "Invalid cover art id").into_response();
    };

    // Determine thumbnail size from requested size
    let thumb_size = match params.size {
        Some(s) if s <= 100 => ThumbSize::Small,
        Some(s) if s <= 300 => ThumbSize::Medium,
        _ => ThumbSize::Large,
    };

    let cache_dir = state.cache_dir.clone();
    let thumb = tokio::task::spawn_blocking(move || {
        thumbnail::get_or_create(&cache_dir, &folder_path, thumb_size)
    })
    .await;

    match thumb {
        Ok(Some(path)) => {
            // Build ETag from file mtime for cache validation
            let etag = tokio::fs::metadata(&path)
                .await
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| format!("\"{}\"", d.as_secs()));

            // Return 304 Not Modified if client already has this version
            if let Some(ref etag_val) = etag {
                if let Some(inm) = headers
                    .get(header::IF_NONE_MATCH)
                    .and_then(|v| v.to_str().ok())
                {
                    if inm == etag_val {
                        let mut resp = StatusCode::NOT_MODIFIED.into_response();
                        let h = resp.headers_mut();
                        h.insert(
                            header::CACHE_CONTROL,
                            "public, max-age=86400"
                                .parse()
                                .expect("static header value"),
                        );
                        if let Ok(val) = etag_val.parse() {
                            h.insert(header::ETAG, val);
                        }
                        return resp;
                    }
                }
            }

            let data = match tokio::fs::read(&path).await {
                Ok(d) => d,
                Err(_) => return (StatusCode::NOT_FOUND, "Read error").into_response(),
            };

            let mut response =
                (StatusCode::OK, [(header::CONTENT_TYPE, "image/jpeg")], data).into_response();
            let headers = response.headers_mut();
            headers.insert(
                header::CACHE_CONTROL,
                "public, max-age=86400"
                    .parse()
                    .expect("static header value"),
            );
            if let Some(etag_val) = etag {
                if let Ok(val) = etag_val.parse() {
                    headers.insert(header::ETAG, val);
                }
            }
            response
        }
        _ => (StatusCode::NOT_FOUND, "No cover art").into_response(),
    }
}

/// Serve a file with Range request support for audio streaming.
///
/// Uses streaming I/O so large files (FLAC, WAV) aren't buffered entirely
/// in memory.
async fn serve_file(file_path: &str, headers: &HeaderMap) -> Response {
    let path = Path::new(file_path);
    let metadata = match tokio::fs::metadata(path).await {
        Ok(m) => m,
        Err(_) => return (StatusCode::NOT_FOUND, "File not found").into_response(),
    };
    let file_size = metadata.len();
    let content_type = mime_type(file_path);

    // Check Range header
    if let Some(range_val) = headers.get(header::RANGE).and_then(|v| v.to_str().ok()) {
        if let Some((start, end)) = parse_range(range_val, file_size) {
            let length = end - start + 1;

            let mut file = match tokio::fs::File::open(path).await {
                Ok(f) => f,
                Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Read error").into_response(),
            };
            if file.seek(std::io::SeekFrom::Start(start)).await.is_err() {
                return (StatusCode::INTERNAL_SERVER_ERROR, "Seek error").into_response();
            }

            let stream = ReaderStream::new(file.take(length));
            let body = Body::from_stream(stream);

            return (
                StatusCode::PARTIAL_CONTENT,
                [
                    (header::CONTENT_TYPE, content_type.to_string()),
                    (header::CONTENT_LENGTH, length.to_string()),
                    (
                        header::CONTENT_RANGE,
                        format!("bytes {start}-{end}/{file_size}"),
                    ),
                    (header::ACCEPT_RANGES, "bytes".to_string()),
                ],
                body,
            )
                .into_response();
        }
    }

    // Full file — stream instead of buffering
    let file = match tokio::fs::File::open(path).await {
        Ok(f) => f,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Read error").into_response(),
    };

    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, content_type.to_string()),
            (header::CONTENT_LENGTH, file_size.to_string()),
            (header::ACCEPT_RANGES, "bytes".to_string()),
        ],
        body,
    )
        .into_response()
}

fn parse_range(header: &str, file_size: u64) -> Option<(u64, u64)> {
    let s = header.strip_prefix("bytes=")?;
    let mut parts = s.splitn(2, '-');
    let start: u64 = parts.next()?.trim().parse().ok()?;
    let end_str = parts.next().unwrap_or("").trim();
    let end: u64 = if end_str.is_empty() {
        file_size - 1
    } else {
        end_str.parse().ok()?
    };
    if start > end || start >= file_size {
        return None;
    }
    Some((start, end.min(file_size - 1)))
}

fn mime_type(path: &str) -> &'static str {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "m4a" | "aac" => "audio/mp4",
        "ogg" => "audio/ogg",
        "opus" => "audio/ogg",
        "wav" => "audio/wav",
        "aiff" | "aif" => "audio/aiff",
        _ => "application/octet-stream",
    }
}
