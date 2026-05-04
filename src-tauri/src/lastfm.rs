use serde::Serialize;
use std::sync::Mutex;
use std::time::{Duration, Instant};

const API_URL: &str = "https://ws.audioscrobbler.com/2.0/";
const API_KEY: &str = "YOUR_LASTFM_API_KEY"; // TODO: Replace with real key from https://www.last.fm/api/account/create
const SHARED_SECRET: &str = "YOUR_LASTFM_SECRET"; // TODO: Replace with real shared secret
const USER_AGENT: &str = "Crate/1.0 (crate-music-app)";
const RATE_LIMIT: Duration = Duration::from_millis(250);

static LAST_REQUEST: Mutex<Option<Instant>> = Mutex::new(None);

// ── Types ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct LastfmSession {
    pub session_key: String,
    pub username: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScrobbleEntry {
    pub artist: String,
    pub track: String,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub duration_secs: u32,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScrobbleResult {
    pub accepted: u32,
    pub ignored: u32,
}

// ── Rate limiting ───────────────────────────────────────────────

fn rate_limit() {
    if let Ok(mut last) = LAST_REQUEST.lock() {
        if let Some(prev) = *last {
            let elapsed = prev.elapsed();
            if elapsed < RATE_LIMIT {
                std::thread::sleep(RATE_LIMIT - elapsed);
            }
        }
        *last = Some(Instant::now());
    }
}

// ── API signature ───────────────────────────────────────────────

/// Build an API method signature per Last.fm spec:
/// sort params alphabetically, concatenate key-value pairs, append shared secret, MD5 hash.
fn api_signature(params: &[(&str, &str)]) -> String {
    let mut sorted: Vec<(&str, &str)> = params.to_vec();
    sorted.sort_by_key(|(k, _)| *k);

    let mut input = String::new();
    for (key, value) in &sorted {
        input.push_str(key);
        input.push_str(value);
    }
    input.push_str(SHARED_SECRET);

    format!("{:x}", md5::compute(input.as_bytes()))
}

/// POST a signed request to the Last.fm API and return the parsed JSON response.
fn api_post(params: &[(&str, &str)]) -> Result<serde_json::Value, String> {
    rate_limit();

    let sig = api_signature(params);

    let mut form: Vec<(&str, &str)> = params.to_vec();
    form.push(("api_sig", &sig));
    form.push(("format", "json"));

    let resp = ureq::post(API_URL)
        .set("User-Agent", USER_AGENT)
        .send_form(&form)
        .map_err(|e| format!("Last.fm request failed: {}", e))?;

    let text = resp
        .into_string()
        .map_err(|e| format!("Failed to read Last.fm response: {}", e))?;

    let json: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("Failed to parse Last.fm JSON: {}", e))?;

    // Last.fm returns errors as { "error": code, "message": "..." }
    if let Some(code) = json.get("error") {
        let msg = json["message"].as_str().unwrap_or("Unknown error");
        return Err(format!("Last.fm error {}: {}", code, msg));
    }

    Ok(json)
}

/// GET a signed request from the Last.fm API.
fn api_get(params: &[(&str, &str)]) -> Result<serde_json::Value, String> {
    rate_limit();

    let sig = api_signature(params);

    let mut req = ureq::get(API_URL).set("User-Agent", USER_AGENT);
    for (key, value) in params {
        req = req.query(key, value);
    }
    req = req.query("api_sig", &sig).query("format", "json");

    let resp = req
        .call()
        .map_err(|e| format!("Last.fm request failed: {}", e))?;

    let text = resp
        .into_string()
        .map_err(|e| format!("Failed to read Last.fm response: {}", e))?;

    let json: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("Failed to parse Last.fm JSON: {}", e))?;

    if let Some(code) = json.get("error") {
        let msg = json["message"].as_str().unwrap_or("Unknown error");
        return Err(format!("Last.fm error {}: {}", code, msg));
    }

    Ok(json)
}

// ── Public API ──────────────────────────────────────────────────

/// Request an authorization token from Last.fm.
pub fn get_token() -> Result<String, String> {
    let params = [("method", "auth.getToken"), ("api_key", API_KEY)];
    let json = api_get(&params)?;

    json["token"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Missing token in Last.fm response".to_string())
}

/// Exchange a token for a session key after the user has authorized in the browser.
pub fn get_session(token: &str) -> Result<LastfmSession, String> {
    let params = [
        ("method", "auth.getSession"),
        ("api_key", API_KEY),
        ("token", token),
    ];
    let json = api_get(&params)?;

    let session = &json["session"];
    let key = session["key"]
        .as_str()
        .ok_or_else(|| "Missing session key in response".to_string())?;
    let name = session["name"]
        .as_str()
        .ok_or_else(|| "Missing username in response".to_string())?;

    Ok(LastfmSession {
        session_key: key.to_string(),
        username: name.to_string(),
    })
}

/// Build the URL the user should visit to authorize the app.
pub fn auth_url(token: &str) -> String {
    format!(
        "https://www.last.fm/api/auth/?api_key={}&token={}",
        API_KEY, token
    )
}

/// Tell Last.fm what the user is currently listening to.
pub fn update_now_playing(
    session_key: &str,
    artist: &str,
    track: &str,
    album: Option<&str>,
    album_artist: Option<&str>,
    duration_secs: Option<u32>,
) -> Result<(), String> {
    let dur_str = duration_secs.map(|d| d.to_string());

    let mut params: Vec<(&str, &str)> = vec![
        ("method", "track.updateNowPlaying"),
        ("api_key", API_KEY),
        ("sk", session_key),
        ("artist", artist),
        ("track", track),
    ];
    if let Some(a) = album {
        params.push(("album", a));
    }
    if let Some(aa) = album_artist {
        params.push(("albumArtist", aa));
    }
    if let Some(ref d) = dur_str {
        params.push(("duration", d));
    }

    api_post(&params)?;
    Ok(())
}

/// Submit one or more completed scrobbles to Last.fm (batch up to 50).
pub fn scrobble(session_key: &str, entries: &[ScrobbleEntry]) -> Result<ScrobbleResult, String> {
    if entries.is_empty() {
        return Ok(ScrobbleResult {
            accepted: 0,
            ignored: 0,
        });
    }
    if entries.len() > 50 {
        return Err("Last.fm batch limit is 50 scrobbles".to_string());
    }

    // Last.fm batch scrobbling uses indexed params: artist[0], track[0], timestamp[0], etc.
    // We need owned strings for the indices and values.
    let mut owned_params: Vec<(String, String)> = vec![
        ("method".to_string(), "track.scrobble".to_string()),
        ("api_key".to_string(), API_KEY.to_string()),
        ("sk".to_string(), session_key.to_string()),
    ];

    for (i, entry) in entries.iter().enumerate() {
        owned_params.push((format!("artist[{i}]"), entry.artist.clone()));
        owned_params.push((format!("track[{i}]"), entry.track.clone()));
        owned_params.push((format!("timestamp[{i}]"), entry.timestamp.to_string()));
        owned_params.push((format!("duration[{i}]"), entry.duration_secs.to_string()));
        if let Some(ref album) = entry.album {
            owned_params.push((format!("album[{i}]"), album.clone()));
        }
        if let Some(ref aa) = entry.album_artist {
            owned_params.push((format!("albumArtist[{i}]"), aa.clone()));
        }
    }

    let params: Vec<(&str, &str)> = owned_params
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();

    let json = api_post(&params)?;

    let accepted = json["scrobbles"]["@attr"]["accepted"]
        .as_u64()
        .or_else(|| {
            json["scrobbles"]["@attr"]["accepted"]
                .as_str()
                .and_then(|s| s.parse().ok())
        })
        .unwrap_or(0) as u32;
    let ignored = json["scrobbles"]["@attr"]["ignored"]
        .as_u64()
        .or_else(|| {
            json["scrobbles"]["@attr"]["ignored"]
                .as_str()
                .and_then(|s| s.parse().ok())
        })
        .unwrap_or(0) as u32;

    Ok(ScrobbleResult { accepted, ignored })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_signature_sorts_params_and_hashes() {
        // Signature = MD5("api_keyTESTKEYmethodauth.getToken" + SHARED_SECRET)
        // We can't test against a fixed hash because SHARED_SECRET is a placeholder,
        // but we can verify determinism and that sorting works.
        let sig1 = api_signature(&[("method", "auth.getToken"), ("api_key", "TESTKEY")]);
        let sig2 = api_signature(&[("api_key", "TESTKEY"), ("method", "auth.getToken")]);
        assert_eq!(sig1, sig2, "Param order should not affect signature");
        assert_eq!(sig1.len(), 32, "MD5 hex should be 32 characters");
    }

    #[test]
    fn auth_url_contains_key_and_token() {
        let url = auth_url("my_token");
        assert!(url.contains(API_KEY));
        assert!(url.contains("my_token"));
        assert!(url.starts_with("https://www.last.fm/api/auth/"));
    }

    #[test]
    fn scrobble_rejects_empty_and_oversized() {
        let result = scrobble("sk", &[]);
        assert!(result.is_ok());
        let r = result.unwrap();
        assert_eq!(r.accepted, 0);

        let big: Vec<ScrobbleEntry> = (0..51)
            .map(|i| ScrobbleEntry {
                artist: format!("a{i}"),
                track: format!("t{i}"),
                album: None,
                album_artist: None,
                duration_secs: 200,
                timestamp: 1000000 + i64::from(i),
            })
            .collect();
        assert!(scrobble("sk", &big).is_err());
    }
}
