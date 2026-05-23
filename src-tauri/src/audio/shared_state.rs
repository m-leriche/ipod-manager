use std::sync::atomic::{AtomicU64, AtomicU8, Ordering};
use std::sync::Arc;

use super::types::PlayState;

/// Shared state between the engine thread, cpal callback, and Tauri commands.
pub struct SharedState {
    pub position: Arc<AtomicU64>,     // f64 bits: seconds
    pub duration: Arc<AtomicU64>,     // f64 bits: seconds
    pub state: Arc<AtomicU8>,         // PlayState as u8
    pub volume: Arc<AtomicU64>,       // f32 bits stored as u64 for atomic access
    pub replay_gain: Arc<AtomicU64>,  // f32 bits: linear gain multiplier (1.0 = no change)
    pub out_samples: Arc<AtomicU64>,  // samples actually played by cpal callback
    pub out_channels: Arc<AtomicU64>, // output channel count (for position calc)
    pub out_rate: Arc<AtomicU64>,     // output sample rate (for position calc)
}

impl SharedState {
    pub fn new() -> Self {
        Self {
            position: Arc::new(AtomicU64::new(0)),
            duration: Arc::new(AtomicU64::new(0)),
            state: Arc::new(AtomicU8::new(PlayState::Stopped as u8)),
            volume: Arc::new(AtomicU64::new(f32::to_bits(0.8) as u64)),
            replay_gain: Arc::new(AtomicU64::new(f32::to_bits(1.0) as u64)),
            out_samples: Arc::new(AtomicU64::new(0)),
            out_channels: Arc::new(AtomicU64::new(2)),
            out_rate: Arc::new(AtomicU64::new(44100)),
        }
    }

    pub fn get_position(&self) -> f64 {
        f64::from_bits(self.position.load(Ordering::Relaxed))
    }

    pub fn set_position(&self, secs: f64) {
        self.position.store(secs.to_bits(), Ordering::Relaxed);
    }

    pub fn get_duration(&self) -> f64 {
        f64::from_bits(self.duration.load(Ordering::Relaxed))
    }

    pub fn set_duration(&self, secs: f64) {
        self.duration.store(secs.to_bits(), Ordering::Relaxed);
    }

    pub fn get_state(&self) -> PlayState {
        PlayState::from_u8(self.state.load(Ordering::Relaxed))
    }

    pub fn set_state(&self, state: PlayState) {
        self.state.store(state as u8, Ordering::Relaxed);
    }

    pub fn set_volume(&self, vol: f32) {
        self.volume
            .store(f32::to_bits(vol) as u64, Ordering::Relaxed);
    }

    pub fn set_replay_gain(&self, gain: f32) {
        self.replay_gain
            .store(f32::to_bits(gain) as u64, Ordering::Relaxed);
    }
}
