mod auth;
mod handlers;
pub mod xml;

use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};

use axum::extract::Request;
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{any, get};
use axum::Router;
use rusqlite::Connection;

/// Cached mapping of stable IDs → names, built lazily on first Subsonic request.
/// Avoids repeated full-table scans when Subsonic clients sync thousands of
/// artists/albums. Not invalidated on library changes — a server restart rebuilds it.
pub struct StableIdCache {
    /// Maps "ar123456" → "The Beatles"
    pub artists: HashMap<String, String>,
    /// Maps "al789012" → ("The Beatles", "Abbey Road")
    pub albums: HashMap<String, (String, String)>,
    /// Maps "al789012" → "/path/to/folder"
    pub album_folders: HashMap<String, String>,
}

/// Shared state for the Subsonic HTTP server.
pub struct SubsonicState {
    pub db: Arc<Mutex<Connection>>,
    pub cache_dir: PathBuf,
    pub username: String,
    pub password: String,
    pub id_cache: RwLock<Option<StableIdCache>>,
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
    db: Arc<Mutex<Connection>>,
    cache_dir: PathBuf,
    port: u16,
    username: String,
    password: String,
) -> SubsonicServer {
    if username == "admin" && password == "admin" {
        log::warn!(
            "Subsonic server using default credentials (admin/admin). \
             Change them in Settings to secure your server."
        );
    }

    let state = Arc::new(SubsonicState {
        db,
        cache_dir,
        username,
        password,
        id_cache: RwLock::new(None),
    });

    // Each Subsonic endpoint is available at /rest/<method>
    // and /rest/<method>.view (some clients append .view).
    // Both GET and POST are accepted — clients vary.
    let mut api_routes = Router::new();
    api_routes = subsonic_route!(api_routes, "/ping", handlers::ping);
    api_routes = subsonic_route!(api_routes, "/getLicense", handlers::get_license);
    api_routes = subsonic_route!(api_routes, "/getMusicFolders", handlers::get_music_folders);
    api_routes = subsonic_route!(
        api_routes,
        "/getMusicDirectory",
        handlers::get_music_directory
    );
    api_routes = subsonic_route!(api_routes, "/getUser", handlers::get_user);
    api_routes = subsonic_route!(api_routes, "/getArtists", handlers::get_artists);
    api_routes = subsonic_route!(api_routes, "/getIndexes", handlers::get_indexes);
    api_routes = subsonic_route!(api_routes, "/getArtist", handlers::get_artist);
    api_routes = subsonic_route!(api_routes, "/getAlbum", handlers::get_album);
    api_routes = subsonic_route!(api_routes, "/getSong", handlers::get_song);
    api_routes = subsonic_route!(api_routes, "/getAlbumList2", handlers::get_album_list2);
    api_routes = subsonic_route!(api_routes, "/getGenres", handlers::get_genres);
    api_routes = subsonic_route!(api_routes, "/search3", handlers::search3);
    api_routes = subsonic_route!(api_routes, "/getPlaylists", handlers::get_playlists);
    api_routes = subsonic_route!(api_routes, "/getPlaylist", handlers::get_playlist);
    api_routes = subsonic_route!(api_routes, "/stream", handlers::stream);
    api_routes = subsonic_route!(api_routes, "/getCoverArt", handlers::get_cover_art);

    let api_routes = api_routes
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            auth::auth_middleware,
        ))
        .with_state(state);

    let app = Router::new()
        .route("/", any(|| async { "Crate Subsonic Server" }))
        .nest("/rest", api_routes)
        .fallback(fallback)
        .layer(middleware::from_fn(log_request));

    let addr = SocketAddr::from(([0, 0, 0, 0], port));

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

    SubsonicServer { port }
}
