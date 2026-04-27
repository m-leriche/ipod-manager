pub mod decoder;
pub mod engine;
pub mod equalizer;
pub mod resampler;
pub mod types;

use std::sync::Arc;

use crossbeam_channel::Sender;
use tauri::{AppHandle, Runtime};

use engine::SharedState;
use types::{AudioCommand, EqConfig, PlayState, PlaybackStatus};

/// Audio engine managed by Tauri. Holds a command sender and shared state
/// for lock-free reads of playback position/duration/state.
pub struct AudioEngine {
    cmd_tx: Sender<AudioCommand>,
    shared: Arc<SharedState>,
}

impl AudioEngine {
    /// Spawn the audio engine on a dedicated thread.
    pub fn spawn<R: Runtime>(app_handle: AppHandle<R>) -> Self {
        let (cmd_tx, cmd_rx) = crossbeam_channel::unbounded();
        let shared = Arc::new(SharedState::new());
        let shared_clone = Arc::clone(&shared);

        std::thread::Builder::new()
            .name("audio-engine".into())
            .spawn(move || {
                engine::run(cmd_rx, shared_clone, app_handle);
            })
            .expect("Failed to spawn audio engine thread");

        Self { cmd_tx, shared }
    }

    fn send(&self, cmd: AudioCommand) {
        let _ = self.cmd_tx.send(cmd);
    }

    pub fn play(&self, path: String, seek_secs: Option<f64>) {
        self.send(AudioCommand::Play { path, seek_secs });
    }

    pub fn pause(&self) {
        self.send(AudioCommand::Pause);
    }

    pub fn resume(&self) {
        self.send(AudioCommand::Resume);
    }

    pub fn stop(&self) {
        self.send(AudioCommand::Stop);
    }

    pub fn seek(&self, position_secs: f64) {
        self.send(AudioCommand::Seek { position_secs });
    }

    pub fn set_volume(&self, volume: f32) {
        self.send(AudioCommand::SetVolume { volume });
    }

    pub fn preload_next(&self, path: String) {
        self.send(AudioCommand::PreloadNext { path });
    }

    pub fn set_eq(&self, config: EqConfig) {
        self.send(AudioCommand::SetEq { config });
    }

    pub fn get_status(&self) -> PlaybackStatus {
        let state = match self.shared.get_state() {
            PlayState::Playing => "playing",
            PlayState::Paused => "paused",
            PlayState::Stopped => "stopped",
        };
        PlaybackStatus {
            state: state.to_string(),
            position_secs: self.shared.get_position(),
            duration_secs: self.shared.get_duration(),
        }
    }
}

impl Drop for AudioEngine {
    fn drop(&mut self) {
        let _ = self.cmd_tx.send(AudioCommand::Shutdown);
    }
}
