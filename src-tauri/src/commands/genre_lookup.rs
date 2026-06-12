use crate::error::AppError;
use crate::files::GenreLookupCancel;
use crate::genre::{self, AlbumGenreQuery};
use crate::library::LibraryDb;
use tauri::{AppHandle, State};

/// Look up suggested genres per album. `albums: None` means the entire
/// library, enumerated as one query per album-artist + album pair.
/// Returns suggestions only — applying goes through `save_metadata`.
#[tauri::command]
pub async fn lookup_album_genres(
    albums: Option<Vec<AlbumGenreQuery>>,
    app: AppHandle,
    db: State<'_, LibraryDb>,
    cancel: State<'_, GenreLookupCancel>,
) -> Result<genre::GenreLookupOutcome, AppError> {
    let flag = cancel.new_flag();

    let queries = match albums {
        Some(a) => a,
        None => all_album_queries(&db)?,
    };

    tauri::async_runtime::spawn_blocking(move || {
        Ok(genre::lookup_album_genres(queries, &app, &flag))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub fn cancel_genre_lookup(cancel: State<'_, GenreLookupCancel>) -> Result<(), AppError> {
    cancel.cancel();
    Ok(())
}

fn all_album_queries(db: &State<'_, LibraryDb>) -> Result<Vec<AlbumGenreQuery>, AppError> {
    let conn = db.lock_conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT COALESCE(album_artist, artist), album, MAX(genre)
             FROM tracks
             WHERE album IS NOT NULL AND album != ''
               AND COALESCE(album_artist, artist) IS NOT NULL
               AND COALESCE(album_artist, artist) != ''
             GROUP BY COALESCE(album_artist, artist), album",
        )
        .map_err(|e| format!("Query failed: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(AlbumGenreQuery {
                artist: row.get(0)?,
                album: row.get(1)?,
                current_genre: row.get(2)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row read failed: {}", e).into())
}
