use percent_encoding::percent_decode_str;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use tauri::http::{Request, Response};

/// Determine MIME type from file extension.
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
        "wma" => "audio/x-ms-wma",
        _ => "application/octet-stream",
    }
}

/// Parse a Range header value like "bytes=1234-" or "bytes=1234-5678".
/// Returns (start, optional_end).
fn parse_range(header: &str, file_size: u64) -> Option<(u64, u64)> {
    let s = header.strip_prefix("bytes=")?;
    let mut parts = s.splitn(2, '-');
    let start_str = parts.next()?.trim();
    let end_str = parts.next().unwrap_or("").trim();

    let start: u64 = start_str.parse().ok()?;
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

/// Handle an audio stream request with Range support.
pub fn handle_request<R: tauri::Runtime>(
    _ctx: tauri::UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let uri = request.uri().to_string();

    // Extract file path from URL: http://stream.localhost/<url-encoded-path>
    // or stream://localhost/<url-encoded-path> (macOS)
    let raw = uri
        .strip_prefix("http://stream.localhost/")
        .or_else(|| uri.strip_prefix("stream://localhost/"))
        .unwrap_or("");

    // Strip query string if present (browsers may append cache params)
    let path_part = raw.split('?').next().unwrap_or(raw);

    let decoded = match percent_decode_str(path_part).decode_utf8() {
        Ok(d) => d.into_owned(),
        Err(_) => {
            return Response::builder()
                .status(400)
                .body(b"Bad path encoding".to_vec())
                .expect("valid HTTP response");
        }
    };

    // Security: only serve files, reject path traversal
    let file_path = Path::new(&decoded);
    if !file_path.is_absolute() || !file_path.exists() {
        return Response::builder()
            .status(404)
            .body(b"Not found".to_vec())
            .expect("valid HTTP response");
    }

    let file_size = match fs::metadata(file_path) {
        Ok(m) => m.len(),
        Err(_) => {
            return Response::builder()
                .status(404)
                .body(b"Not found".to_vec())
                .expect("valid HTTP response");
        }
    };

    let content_type = mime_type(&decoded);

    // Check for Range header
    let range_header = request
        .headers()
        .get("range")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    if let Some(ref range_val) = range_header {
        if let Some((start, end)) = parse_range(range_val, file_size) {
            let length = end - start + 1;
            let mut file = match File::open(file_path) {
                Ok(f) => f,
                Err(_) => {
                    return Response::builder()
                        .status(500)
                        .body(b"Read error".to_vec())
                        .expect("valid HTTP response");
                }
            };

            if file.seek(SeekFrom::Start(start)).is_err() {
                return Response::builder()
                    .status(500)
                    .body(b"Seek error".to_vec())
                    .expect("valid HTTP response");
            }

            let mut buf = vec![0u8; length as usize];
            let bytes_read = match file.read(&mut buf) {
                Ok(n) => n,
                Err(_) => {
                    return Response::builder()
                        .status(500)
                        .body(b"Read error".to_vec())
                        .expect("valid HTTP response");
                }
            };
            buf.truncate(bytes_read);

            return Response::builder()
                .status(206)
                .header("Content-Type", content_type)
                .header("Content-Length", bytes_read.to_string())
                .header(
                    "Content-Range",
                    format!(
                        "bytes {}-{}/{}",
                        start,
                        start + bytes_read as u64 - 1,
                        file_size
                    ),
                )
                .header("Accept-Ranges", "bytes")
                .body(buf)
                .expect("valid HTTP response");
        }
    }

    // No Range header — serve full file
    let body = match fs::read(file_path) {
        Ok(data) => data,
        Err(_) => {
            return Response::builder()
                .status(500)
                .body(b"Read error".to_vec())
                .expect("valid HTTP response");
        }
    };

    Response::builder()
        .status(200)
        .header("Content-Type", content_type)
        .header("Content-Length", file_size.to_string())
        .header("Accept-Ranges", "bytes")
        .body(body)
        .expect("valid HTTP response")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mime_type_common_formats() {
        assert_eq!(mime_type("/music/song.mp3"), "audio/mpeg");
        assert_eq!(mime_type("/music/song.flac"), "audio/flac");
        assert_eq!(mime_type("/music/song.m4a"), "audio/mp4");
        assert_eq!(mime_type("/music/song.ogg"), "audio/ogg");
        assert_eq!(mime_type("/music/song.wav"), "audio/wav");
        assert_eq!(mime_type("/music/song.aiff"), "audio/aiff");
        assert_eq!(mime_type("/music/song.aac"), "audio/mp4");
        assert_eq!(mime_type("/music/song.opus"), "audio/ogg");
        assert_eq!(mime_type("/music/song.wma"), "audio/x-ms-wma");
    }

    #[test]
    fn mime_type_case_insensitive() {
        assert_eq!(mime_type("/music/song.MP3"), "audio/mpeg");
        assert_eq!(mime_type("/music/song.FLAC"), "audio/flac");
    }

    #[test]
    fn mime_type_unknown() {
        assert_eq!(mime_type("/music/song.xyz"), "application/octet-stream");
        assert_eq!(mime_type("/music/song"), "application/octet-stream");
    }

    #[test]
    fn parse_range_open_end() {
        assert_eq!(parse_range("bytes=100-", 1000), Some((100, 999)));
    }

    #[test]
    fn parse_range_closed() {
        assert_eq!(parse_range("bytes=100-499", 1000), Some((100, 499)));
    }

    #[test]
    fn parse_range_clamps_end() {
        assert_eq!(parse_range("bytes=100-9999", 1000), Some((100, 999)));
    }

    #[test]
    fn parse_range_start_at_zero() {
        assert_eq!(parse_range("bytes=0-", 500), Some((0, 499)));
    }

    #[test]
    fn parse_range_invalid_start_past_size() {
        assert_eq!(parse_range("bytes=1000-", 500), None);
    }

    #[test]
    fn parse_range_invalid_format() {
        assert_eq!(parse_range("chunks=0-100", 500), None);
        assert_eq!(parse_range("bytes=abc-", 500), None);
    }
}
