use souvlaki::{MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, PlatformConfig};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

// souvlaki's MediaControls is !Send on macOS (Objective-C pointers).
// We wrap it to store in Tauri state, protected by a Mutex for exclusive access.
struct SendControls(MediaControls);
unsafe impl Send for SendControls {}

pub struct MediaKeyState {
    controls: Mutex<SendControls>,
}

pub fn init(app_handle: &AppHandle) -> Result<MediaKeyState, String> {
    let config = PlatformConfig {
        dbus_name: "crate_music",
        display_name: "Crate",
        hwnd: None,
    };

    let mut controls = MediaControls::new(config)
        .map_err(|e| format!("Failed to init media controls: {:?}", e))?;

    let handle = app_handle.clone();
    controls
        .attach(move |event: MediaControlEvent| match event {
            MediaControlEvent::Toggle => {
                let _ = handle.emit("mediakey:toggle", ());
            }
            MediaControlEvent::Play => {
                let _ = handle.emit("mediakey:play", ());
            }
            MediaControlEvent::Pause => {
                let _ = handle.emit("mediakey:pause", ());
            }
            MediaControlEvent::Next => {
                let _ = handle.emit("mediakey:next", ());
            }
            MediaControlEvent::Previous => {
                let _ = handle.emit("mediakey:previous", ());
            }
            _ => {}
        })
        .map_err(|e| format!("Failed to attach media key handler: {:?}", e))?;

    Ok(MediaKeyState {
        controls: Mutex::new(SendControls(controls)),
    })
}

pub fn set_metadata(
    state: &MediaKeyState,
    title: Option<&str>,
    artist: Option<&str>,
    album: Option<&str>,
    duration_secs: Option<f64>,
) {
    if let Ok(mut controls) = state.controls.lock() {
        let _ = controls.0.set_metadata(MediaMetadata {
            title,
            artist,
            album,
            duration: duration_secs.map(std::time::Duration::from_secs_f64),
            ..Default::default()
        });
    }
}

pub fn set_playback(state: &MediaKeyState, is_playing: bool) {
    if let Ok(mut controls) = state.controls.lock() {
        let playback = if is_playing {
            MediaPlayback::Playing { progress: None }
        } else {
            MediaPlayback::Paused { progress: None }
        };
        let _ = controls.0.set_playback(playback);
    }
}
