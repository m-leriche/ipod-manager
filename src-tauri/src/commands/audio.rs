use crate::audio::types::{EqConfig, PlaybackStatus};
use crate::audio::AudioEngine;
use crate::error::AppError;
use crate::mediakeys::MediaKeyState;
use tauri::State;

#[tauri::command]
pub fn audio_play(
    path: String,
    seek_secs: Option<f64>,
    engine: State<'_, AudioEngine>,
) -> Result<(), AppError> {
    engine.play(path, seek_secs);
    Ok(())
}

#[tauri::command]
pub fn audio_pause(engine: State<'_, AudioEngine>) -> Result<(), AppError> {
    engine.pause();
    Ok(())
}

#[tauri::command]
pub fn audio_resume(engine: State<'_, AudioEngine>) -> Result<(), AppError> {
    engine.resume();
    Ok(())
}

#[tauri::command]
pub fn audio_stop(engine: State<'_, AudioEngine>) -> Result<(), AppError> {
    engine.stop();
    Ok(())
}

#[tauri::command]
pub fn audio_seek(position_secs: f64, engine: State<'_, AudioEngine>) -> Result<(), AppError> {
    engine.seek(position_secs);
    Ok(())
}

#[tauri::command]
pub fn audio_set_volume(volume: f32, engine: State<'_, AudioEngine>) -> Result<(), AppError> {
    engine.set_volume(volume);
    Ok(())
}

#[tauri::command]
pub fn audio_preload_next(path: String, engine: State<'_, AudioEngine>) -> Result<(), AppError> {
    engine.preload_next(path);
    Ok(())
}

#[tauri::command]
pub fn audio_get_status(engine: State<'_, AudioEngine>) -> Result<PlaybackStatus, AppError> {
    Ok(engine.get_status())
}

#[tauri::command]
pub fn audio_set_eq(config: EqConfig, engine: State<'_, AudioEngine>) -> Result<(), AppError> {
    engine.set_eq(config);
    Ok(())
}

#[tauri::command]
pub fn audio_set_speed(speed: f64, engine: State<'_, AudioEngine>) -> Result<(), AppError> {
    engine.set_speed(speed);
    Ok(())
}

// ── Media key / Now Playing commands ─────────────────────────────

#[tauri::command]
pub fn media_set_metadata(
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    duration_secs: Option<f64>,
    state: State<'_, MediaKeyState>,
) -> Result<(), AppError> {
    crate::mediakeys::set_metadata(
        &state,
        title.as_deref(),
        artist.as_deref(),
        album.as_deref(),
        duration_secs,
    );
    Ok(())
}

#[tauri::command]
pub fn media_set_playback(
    is_playing: bool,
    state: State<'_, MediaKeyState>,
) -> Result<(), AppError> {
    crate::mediakeys::set_playback(&state, is_playing);
    Ok(())
}
