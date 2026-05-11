mod decode;
mod playback;
mod transitions;

use std::sync::Arc;
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Host, Stream};
use crossbeam_channel::Receiver;
use tauri::{AppHandle, Runtime};

use super::crossfade::CrossfadeState;
use super::decoder::AudioDecoder;
use super::equalizer::Equalizer;
use super::resampler::Resampler;
use super::shared_state::SharedState;
use super::spectrum::SpectrumAnalyzer;
use super::time_stretch::TimeStretcher;
use super::types::{AudioCommand, PlayState};

// Ring buffer size: ~500ms at 96kHz stereo (generous for high sample rates)
const RING_BUFFER_SIZE: usize = 96000 * 2;

/// All mutable state for the audio engine, bundled to keep `run()` readable.
struct EngineState<R: Runtime> {
    host: Host,
    output_rate: u32,
    output_channels: u16,
    current_stream: Option<Stream>,
    ring_producer: Option<ringbuf::HeapProd<f32>>,

    decoder: Option<AudioDecoder>,
    resampler: Option<Resampler>,
    source_channels: u16,
    source_rate: u32,

    equalizer: Equalizer,
    time_stretcher: TimeStretcher,
    spectrum: SpectrumAnalyzer,
    leftover: Vec<f32>,

    preloaded: Option<(AudioDecoder, Option<Resampler>, u16)>,
    crossfade: Option<CrossfadeState>,
    crossfade_duration_secs: f64,

    source_pos_secs: f64,
    playback_offset_secs: f64,
    current_speed: f64,
    last_position_event: std::time::Instant,
    last_spectrum_event: std::time::Instant,

    shared: Arc<SharedState>,
    app_handle: AppHandle<R>,
}

/// Runs the audio engine on a dedicated thread.
/// This function does not return until Shutdown is received.
pub fn run<R: Runtime>(
    cmd_rx: Receiver<AudioCommand>,
    shared: Arc<SharedState>,
    app_handle: AppHandle<R>,
) {
    let host = cpal::default_host();
    let device = match host.default_output_device() {
        Some(d) => d,
        None => {
            log::error!("No audio output device found");
            return;
        }
    };

    let default_config = match device.default_output_config() {
        Ok(c) => c,
        Err(e) => {
            log::error!("No default output config: {}", e);
            return;
        }
    };
    let output_rate = default_config.sample_rate().0;
    let output_channels = default_config.channels();

    let mut state = EngineState {
        host,
        output_rate,
        output_channels,
        current_stream: None,
        ring_producer: None,
        decoder: None,
        resampler: None,
        source_channels: 2,
        source_rate: 44100,
        equalizer: Equalizer::new(output_rate, output_channels),
        time_stretcher: TimeStretcher::new(output_channels),
        spectrum: SpectrumAnalyzer::new(),
        leftover: Vec::new(),
        preloaded: None,
        crossfade: None,
        crossfade_duration_secs: 0.0,
        source_pos_secs: 0.0,
        playback_offset_secs: 0.0,
        current_speed: 1.0,
        last_position_event: std::time::Instant::now(),
        last_spectrum_event: std::time::Instant::now(),
        shared,
        app_handle,
    };

    loop {
        // Process all pending commands
        while let Ok(cmd) = cmd_rx.try_recv() {
            match cmd {
                AudioCommand::Play { path, seek_secs } => state.handle_play(path, seek_secs),
                AudioCommand::Pause => {
                    if let Some(ref stream) = state.current_stream {
                        stream.pause().ok();
                    }
                    state.shared.set_state(PlayState::Paused);
                }
                AudioCommand::Resume => {
                    if let Some(ref stream) = state.current_stream {
                        stream.play().ok();
                    }
                    state.shared.set_state(PlayState::Playing);
                }
                AudioCommand::Stop => {
                    state.stop_playback();
                    state.shared.set_duration(0.0);
                    state.shared.set_state(PlayState::Stopped);
                }
                AudioCommand::Seek { position_secs } => state.handle_seek(position_secs),
                AudioCommand::SetVolume { volume } => {
                    state.shared.set_volume(volume.clamp(0.0, 1.0));
                }
                AudioCommand::PreloadNext { path } => match AudioDecoder::open(&path) {
                    Ok(dec) => {
                        let src_ch = dec.channels;
                        let rs = Resampler::new(dec.sample_rate, output_rate, output_channels);
                        let rs_opt = if rs.is_active() { Some(rs) } else { None };
                        state.preloaded = Some((dec, rs_opt, src_ch));
                    }
                    Err(e) => {
                        log::warn!("Failed to preload next track: {}", e);
                        state.preloaded = None;
                    }
                },
                AudioCommand::SetEq { config } => state.equalizer.update_config(&config),
                AudioCommand::SetSpeed { speed } => state.handle_set_speed(speed),
                AudioCommand::SetCrossfade { duration_secs } => {
                    state.crossfade_duration_secs = duration_secs.clamp(0.0, 12.0);
                }
                AudioCommand::Shutdown => {
                    if let Some(stream) = state.current_stream.take() {
                        stream.pause().ok();
                    }
                    state.shared.set_state(PlayState::Stopped);
                    return;
                }
            }
        }

        // Decode and fill ring buffer if playing
        if state.shared.get_state() == PlayState::Playing {
            let (gapless, begin_cf) = state.decode_and_fill();

            if begin_cf {
                state.begin_crossfade();
            }
            if gapless {
                state.do_gapless_transition();
            }

            state.emit_position();
            state.emit_spectrum();
        }

        // Don't busy-wait
        std::thread::sleep(Duration::from_millis(2));
    }
}
