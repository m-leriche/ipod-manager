use serde::Deserialize;

/// Commands sent from the Tauri command thread to the audio engine thread.
#[allow(dead_code)]
pub enum AudioCommand {
    Play {
        path: String,
        seek_secs: Option<f64>,
    },
    Pause,
    Resume,
    Stop,
    Seek {
        position_secs: f64,
    },
    SetVolume {
        volume: f32,
    },
    PreloadNext {
        path: String,
    },
    SetEq {
        config: EqConfig,
    },
    SetSpeed {
        speed: f64,
    },
    Shutdown,
}

/// Playback state reported to the frontend.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum PlayState {
    Stopped = 0,
    Playing = 1,
    Paused = 2,
}

impl PlayState {
    pub fn from_u8(v: u8) -> Self {
        match v {
            1 => Self::Playing,
            2 => Self::Paused,
            _ => Self::Stopped,
        }
    }
}

/// Status snapshot returned by audio_get_status.
#[derive(serde::Serialize, Clone)]
pub struct PlaybackStatus {
    /// "playing", "paused", or "stopped"
    pub state: String,
    pub position_secs: f64,
    pub duration_secs: f64,
}

/// EQ configuration sent from the frontend.
#[derive(Deserialize, Clone, Debug)]
#[allow(dead_code)]
pub struct EqConfig {
    pub enabled: bool,
    pub preamp_db: f32,
    pub bands: Vec<EqBand>,
}

/// A single EQ band.
#[derive(Deserialize, Clone, Debug)]
#[allow(dead_code)]
pub struct EqBand {
    pub filter_type: String, // "peaking", "lowshelf", "highshelf"
    pub frequency: f32,
    pub gain_db: f32,
    pub q: f32,
}
