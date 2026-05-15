/// Subsonic API authentication.
///
/// Clients authenticate via query parameters on every request:
/// - `u` = username
/// - `p` = password (plaintext or hex-encoded with `enc:` prefix)
/// - OR `t` = token (md5(password + salt)), `s` = salt
///
/// We validate against a single configured username/password.
use std::sync::Arc;

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use super::xml;
use super::SubsonicState;

#[derive(Debug, serde::Deserialize)]
pub struct AuthParams {
    /// Username
    pub u: Option<String>,
    /// Password (plaintext or `enc:hex`)
    pub p: Option<String>,
    /// Token = md5(password + salt)
    pub t: Option<String>,
    /// Salt (used with token auth)
    pub s: Option<String>,
    /// Client name (sent by clients, not validated here)
    #[allow(dead_code)]
    pub c: Option<String>,
    /// Protocol version (sent by clients, not validated here)
    #[allow(dead_code)]
    pub v: Option<String>,
}

/// XML response with 401 status for auth failures.
fn auth_error() -> Response {
    let body = xml::error_response(xml::error_codes::AUTH_FAILED, "Wrong username or password");
    (
        StatusCode::OK, // Subsonic clients expect 200 even for auth errors
        [("content-type", "application/xml; charset=UTF-8")],
        body,
    )
        .into_response()
}

/// Middleware that validates Subsonic auth params on every request.
pub async fn auth_middleware(
    State(state): State<Arc<SubsonicState>>,
    Query(params): Query<AuthParams>,
    request: axum::extract::Request,
    next: Next,
) -> Response {
    let Some(username) = &params.u else {
        return auth_error();
    };

    if username != &state.username {
        return auth_error();
    }

    // Token-based auth: t = md5(password + s)
    if let (Some(token), Some(salt)) = (&params.t, &params.s) {
        let expected = format!("{:x}", md5::compute(format!("{}{}", state.password, salt)));
        if token != &expected {
            return auth_error();
        }
        return next.run(request).await;
    }

    // Password-based auth (plaintext or enc:hex)
    if let Some(password) = &params.p {
        let plain = if let Some(hex) = password.strip_prefix("enc:") {
            decode_hex_password(hex)
        } else {
            Some(password.clone())
        };

        match plain {
            Some(p) if p == state.password => return next.run(request).await,
            _ => return auth_error(),
        }
    }

    auth_error()
}

/// Decode a hex-encoded password (Subsonic `enc:` format).
fn decode_hex_password(hex: &str) -> Option<String> {
    let bytes: Result<Vec<u8>, _> = (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16))
        .collect();
    bytes.ok().and_then(|b| String::from_utf8(b).ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_hex_password_valid() {
        // "sesame" in hex
        assert_eq!(
            decode_hex_password("736573616d65"),
            Some("sesame".to_string())
        );
    }

    #[test]
    fn decode_hex_password_empty() {
        assert_eq!(decode_hex_password(""), Some(String::new()));
    }

    #[test]
    fn decode_hex_password_invalid() {
        assert_eq!(decode_hex_password("zzzz"), None);
    }

    #[test]
    fn token_auth_md5() {
        let password = "sesame";
        let salt = "abc123";
        let expected = format!("{:x}", md5::compute(format!("{password}{salt}")));
        assert!(!expected.is_empty());
    }
}
