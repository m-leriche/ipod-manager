mod auth;
mod handlers;
pub mod xml;

use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use axum::extract::Request;
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{any, get};
use axum::Router;
use rusqlite::{Connection, OpenFlags};
use tower_http::compression::CompressionLayer;

/// Cached mapping of stable IDs → names, built lazily on first Subsonic request.
/// Avoids repeated full-table scans when Subsonic clients sync thousands of
/// artists/albums. Invalidated when the library changes (scan, import, delete).
pub struct StableIdCache {
    /// Maps "ar123456" → "The Beatles"
    pub artists: HashMap<String, String>,
    /// Maps "al789012" → ("The Beatles", "Abbey Road")
    pub albums: HashMap<String, (String, String)>,
    /// Maps "al789012" → "/path/to/folder"
    pub album_folders: HashMap<String, String>,
}

/// Shared state for the Subsonic HTTP server.
///
/// Uses `db_path` instead of a shared connection so each request can open its
/// own read-only SQLite connection. WAL mode allows unlimited concurrent readers,
/// eliminating the previous single-Mutex bottleneck.
pub struct SubsonicState {
    pub db_path: PathBuf,
    pub cache_dir: PathBuf,
    pub username: String,
    pub password: String,
    pub id_cache: RwLock<Option<StableIdCache>>,
}

impl SubsonicState {
    /// Clear the cached ID mappings so they are rebuilt from the database
    /// on the next Subsonic request. Call this after any library mutation
    /// (scan, import, delete, rename) that adds/removes artists or albums.
    pub fn invalidate_cache(&self) {
        match self.id_cache.write() {
            Ok(mut cache) => {
                *cache = None;
                log::info!("Subsonic ID cache invalidated");
            }
            Err(e) => {
                log::error!("Failed to invalidate Subsonic cache (poisoned lock): {e}");
            }
        }
    }
}

/// Handle stored in Tauri managed state so library commands can
/// invalidate the Subsonic cache after mutations.
pub struct SubsonicCacheHandle {
    state: Arc<SubsonicState>,
}

impl SubsonicCacheHandle {
    pub fn invalidate(&self) {
        self.state.invalidate_cache();
    }
}

/// Open a read-only SQLite connection for a Subsonic request.
///
/// Each call creates an independent connection so requests don't block each other.
/// The `sort_key` SQL function is registered on each connection for ORDER BY support.
pub fn open_read_conn(db_path: &Path) -> Result<Connection, String> {
    let conn = Connection::open_with_flags(
        db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("DB open: {e}"))?;
    // WAL mode is already set by init_db on the main connection.
    // query_only prevents accidental writes from read-only handlers.
    conn.execute_batch("PRAGMA query_only = ON;")
        .map_err(|e| format!("pragma: {e}"))?;
    crate::library::register_sort_key(&conn)?;
    Ok(conn)
}

/// Handle returned from `start_server` so we can shut it down later.
pub struct SubsonicServer {
    pub port: u16,
}

/// Logging middleware — logs every incoming request so we can debug client issues.
async fn log_request(request: Request, next: Next) -> Response {
    let method = request.method().clone();
    let uri = request.uri().clone();
    log::info!("Subsonic ← {method} {uri}");
    let response = next.run(request).await;
    let status = response.status();
    log::info!("Subsonic → {status} for {method} {uri}");
    response
}

/// Catch-all fallback for unhandled routes — logs the path so we can
/// see what clients are requesting that we don't serve yet.
async fn fallback(request: Request) -> Response {
    let uri = request.uri().clone();
    let method = request.method().clone();
    log::warn!("Subsonic 404: {method} {uri} (not implemented)");
    (
        axum::http::StatusCode::NOT_FOUND,
        format!("Unknown endpoint: {uri}"),
    )
        .into_response()
}

/// Helper to register a route for both GET and POST (many Subsonic
/// clients use POST for the same endpoints).
macro_rules! subsonic_route {
    ($router:expr, $path:expr, $handler:expr) => {
        $router
            .route($path, get($handler).post($handler))
            .route(concat!($path, ".view"), get($handler).post($handler))
    };
}

/// Start the Subsonic-compatible HTTP server on the given port.
///
/// Shares the library database with the Tauri app. Runs on the existing
/// tokio runtime provided by Tauri.
pub fn start_server(
    db_path: PathBuf,
    cache_dir: PathBuf,
    port: u16,
    username: String,
    password: String,
) -> (SubsonicServer, SubsonicCacheHandle) {
    let using_defaults = username == "admin" && password == "admin";
    if using_defaults {
        log::warn!(
            "Subsonic server using default credentials (admin/admin). \
             Binding to localhost only — remote access is blocked until \
             credentials are changed in Settings."
        );
    }

    let state = Arc::new(SubsonicState {
        db_path,
        cache_dir,
        username,
        password,
        id_cache: RwLock::new(None),
    });

    // Each Subsonic endpoint is available at /rest/<method>
    // and /rest/<method>.view (some clients append .view).
    // Both GET and POST are accepted — clients vary.
    //
    // XML routes get gzip compression; binary routes (stream, coverArt)
    // skip it since audio/image formats are already compressed.
    let mut xml_routes = Router::new();
    xml_routes = subsonic_route!(xml_routes, "/ping", handlers::ping);
    xml_routes = subsonic_route!(xml_routes, "/getLicense", handlers::get_license);
    xml_routes = subsonic_route!(xml_routes, "/getMusicFolders", handlers::get_music_folders);
    xml_routes = subsonic_route!(
        xml_routes,
        "/getMusicDirectory",
        handlers::get_music_directory
    );
    xml_routes = subsonic_route!(xml_routes, "/getUser", handlers::get_user);
    xml_routes = subsonic_route!(xml_routes, "/getArtists", handlers::get_artists);
    xml_routes = subsonic_route!(xml_routes, "/getIndexes", handlers::get_indexes);
    xml_routes = subsonic_route!(xml_routes, "/getArtist", handlers::get_artist);
    xml_routes = subsonic_route!(xml_routes, "/getAlbum", handlers::get_album);
    xml_routes = subsonic_route!(xml_routes, "/getSong", handlers::get_song);
    xml_routes = subsonic_route!(xml_routes, "/getAlbumList2", handlers::get_album_list2);
    xml_routes = subsonic_route!(xml_routes, "/getGenres", handlers::get_genres);
    xml_routes = subsonic_route!(xml_routes, "/search3", handlers::search3);
    xml_routes = subsonic_route!(xml_routes, "/getPlaylists", handlers::get_playlists);
    xml_routes = subsonic_route!(xml_routes, "/getPlaylist", handlers::get_playlist);

    let mut binary_routes = Router::new();
    binary_routes = subsonic_route!(binary_routes, "/stream", handlers::stream);
    binary_routes = subsonic_route!(binary_routes, "/getCoverArt", handlers::get_cover_art);

    let api_routes = xml_routes
        .layer(CompressionLayer::new().gzip(true))
        .merge(binary_routes)
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            auth::auth_middleware,
        ))
        .with_state(state.clone());

    let cache_handle = SubsonicCacheHandle {
        state: state.clone(),
    };

    let app = Router::new()
        .route("/", any(|| async { "Crate Subsonic Server" }))
        .nest("/rest", api_routes)
        .fallback(fallback)
        .layer(middleware::from_fn(log_request));

    // Bind to localhost only when using default credentials to prevent
    // unauthenticated remote access. Once the user sets real credentials,
    // the server binds to all interfaces for LAN/VPN streaming.
    let bind_addr: [u8; 4] = if using_defaults {
        [127, 0, 0, 1]
    } else {
        [0, 0, 0, 0]
    };
    let addr = SocketAddr::from((bind_addr, port));

    tauri::async_runtime::spawn(async move {
        match tokio::net::TcpListener::bind(addr).await {
            Ok(listener) => {
                log::info!("Subsonic server listening on {addr}");
                if let Err(e) = axum::serve(listener, app).await {
                    log::error!("Subsonic server error: {e}");
                }
            }
            Err(e) => {
                log::error!("Failed to bind Subsonic server on {addr}: {e}");
            }
        }
    });

    (SubsonicServer { port }, cache_handle)
}

#[cfg(test)]
mod cache_tests {
    use super::*;

    fn make_state() -> SubsonicState {
        SubsonicState {
            db_path: PathBuf::from("/tmp/test.db"),
            cache_dir: PathBuf::from("/tmp/cache"),
            username: "admin".to_string(),
            password: "admin".to_string(),
            id_cache: RwLock::new(Some(StableIdCache {
                artists: HashMap::from([("ar1".to_string(), "Artist".to_string())]),
                albums: HashMap::new(),
                album_folders: HashMap::new(),
            })),
        }
    }

    #[test]
    fn invalidate_clears_cache() {
        let state = make_state();
        assert!(state.id_cache.read().unwrap().is_some());

        state.invalidate_cache();
        assert!(state.id_cache.read().unwrap().is_none());
    }

    #[test]
    fn invalidate_is_idempotent() {
        let state = make_state();
        state.invalidate_cache();
        state.invalidate_cache();
        assert!(state.id_cache.read().unwrap().is_none());
    }
}
