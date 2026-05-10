use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Host, Stream};
use crossbeam_channel::Receiver;
use ringbuf::traits::{Observer, Producer, Split};
use ringbuf::HeapRb;
use tauri::{AppHandle, Emitter, Runtime};

use super::crossfade::{mix_crossfade, CrossfadeState};
use super::decoder::AudioDecoder;
use super::equalizer::Equalizer;
use super::output::{adapt_channels, create_output_stream, decode_old_track};
use super::resampler::Resampler;
use super::shared_state::SharedState;
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
    leftover: Vec<f32>,

    preloaded: Option<(AudioDecoder, Option<Resampler>, u16)>,
    crossfade: Option<CrossfadeState>,
    crossfade_duration_secs: f64,

    source_pos_secs: f64,
    playback_offset_secs: f64,
    current_speed: f64,
    last_position_event: std::time::Instant,

    shared: Arc<SharedState>,
    app_handle: AppHandle<R>,
}

impl<R: Runtime> EngineState<R> {
    fn handle_play(&mut self, path: String, seek_secs: Option<f64>) {
        self.stop_playback();

        match AudioDecoder::open(&path) {
            Ok(mut dec) => {
                let src_rate = dec.sample_rate;
                let src_ch = dec.channels;
                let dur = dec.duration_secs;

                self.shared.set_duration(dur);
                self.shared
                    .out_channels
                    .store(self.output_channels as u64, Ordering::Relaxed);
                self.shared
                    .out_rate
                    .store(self.output_rate as u64, Ordering::Relaxed);
                self.source_channels = src_ch;
                self.source_rate = src_rate;

                let rs = Resampler::new(src_rate, self.output_rate, self.output_channels);
                self.resampler = if rs.is_active() { Some(rs) } else { None };

                self.source_pos_secs = 0.0;
                self.playback_offset_secs = 0.0;
                if let Some(secs) = seek_secs {
                    if dec.seek(secs).is_ok() {
                        self.source_pos_secs = secs;
                        self.playback_offset_secs = secs;
                        self.shared.set_position(secs);
                    }
                }

                let rb = HeapRb::<f32>::new(RING_BUFFER_SIZE);
                let (prod, cons) = rb.split();

                match create_output_stream(
                    &self.host,
                    self.output_rate,
                    self.output_channels,
                    cons,
                    Arc::clone(&self.shared.volume),
                    Arc::clone(&self.shared.out_samples),
                ) {
                    Ok(stream) => {
                        stream.play().ok();
                        self.current_stream = Some(stream);
                        self.ring_producer = Some(prod);
                        self.decoder = Some(dec);
                        self.shared.set_state(PlayState::Playing);
                        let _ = self.app_handle.emit("audio:duration-ready", dur);
                    }
                    Err(e) => {
                        log::error!("Failed to create audio stream: {}", e);
                        let _ = self.app_handle.emit("audio:error", e);
                        self.shared.set_state(PlayState::Stopped);
                    }
                }
            }
            Err(e) => {
                log::error!("Failed to open audio: {}", e);
                let _ = self.app_handle.emit("audio:error", e);
                self.shared.set_state(PlayState::Stopped);
            }
        }
    }

    fn stop_playback(&mut self) {
        if let Some(stream) = self.current_stream.take() {
            stream.pause().ok();
        }
        self.ring_producer = None;
        self.decoder = None;
        self.resampler = None;
        self.preloaded = None;
        self.crossfade = None;
        self.leftover.clear();
        self.equalizer.reset();
        self.shared.out_samples.store(0, Ordering::Relaxed);
        self.shared.set_position(0.0);
    }

    fn handle_seek(&mut self, position_secs: f64) {
        let Some(ref mut dec) = self.decoder else {
            return;
        };
        if dec.seek(position_secs).is_err() {
            return;
        }

        self.leftover.clear();
        if let Some(ref mut rs) = self.resampler {
            rs.reset();
        }
        self.time_stretcher.reset();
        self.equalizer.reset();
        self.crossfade = None;

        // Clear ring buffer by dropping and recreating the stream
        if self.current_stream.is_some() {
            let rb = HeapRb::<f32>::new(RING_BUFFER_SIZE);
            let (prod, cons) = rb.split();

            if let Some(stream) = self.current_stream.take() {
                stream.pause().ok();
            }

            match create_output_stream(
                &self.host,
                self.output_rate,
                self.output_channels,
                cons,
                Arc::clone(&self.shared.volume),
                Arc::clone(&self.shared.out_samples),
            ) {
                Ok(stream) => {
                    if self.shared.get_state() == PlayState::Playing {
                        stream.play().ok();
                    }
                    self.current_stream = Some(stream);
                    self.ring_producer = Some(prod);
                }
                Err(e) => {
                    log::error!("Failed to recreate stream after seek: {}", e);
                }
            }
        }

        self.source_pos_secs = position_secs;
        self.playback_offset_secs = position_secs;
        self.shared.out_samples.store(0, Ordering::Relaxed);
        self.shared.set_position(position_secs);
    }

    fn handle_set_speed(&mut self, speed: f64) {
        // Anchor playback position before speed change so out_samples
        // count restarts relative to the new speed.
        let out = self.shared.out_samples.load(Ordering::Relaxed);
        let ch = self.shared.out_channels.load(Ordering::Relaxed).max(1);
        let rate = self.shared.out_rate.load(Ordering::Relaxed).max(1);
        let wall_secs = out as f64 / (rate as f64 * ch as f64);
        self.playback_offset_secs += wall_secs * self.current_speed;
        self.shared.out_samples.store(0, Ordering::Relaxed);

        self.current_speed = speed;
        self.time_stretcher.set_speed(speed);
    }

    /// Install a new track as the active decoder, resetting processing state.
    /// Shared by both crossfade and gapless transitions.
    fn install_track(&mut self, dec: AudioDecoder, rs: Option<Resampler>, src_ch: u16) {
        let dur = dec.duration_secs;
        self.source_rate = dec.sample_rate;
        self.decoder = Some(dec);
        self.resampler = rs;
        self.source_channels = src_ch;
        self.equalizer.reset();
        self.time_stretcher.reset();
        self.leftover.clear();
        self.source_pos_secs = 0.0;
        self.playback_offset_secs = 0.0;
        self.shared.out_samples.store(0, Ordering::Relaxed);
        self.shared.set_position(0.0);
        self.shared.set_duration(dur);
        let _ = self.app_handle.emit("audio:gapless-transition", dur);
    }

    /// Decode audio samples and push them into the ring buffer.
    /// Returns `(gapless_transition, begin_crossfade)` flags.
    fn decode_and_fill(&mut self) -> (bool, bool) {
        let (Some(ref mut dec), Some(ref mut prod)) = (&mut self.decoder, &mut self.ring_producer)
        else {
            return (false, false);
        };

        // Push leftover samples from previous iteration
        let mut i = 0;
        while i < self.leftover.len() {
            if prod.try_push(self.leftover[i]).is_err() {
                break;
            }
            i += 1;
        }
        self.leftover.drain(..i);

        if !self.leftover.is_empty() {
            self.shared.set_position(self.source_pos_secs);
            return (false, false);
        }

        let dur = self.shared.get_duration();
        let mut filled = 0;

        while prod.vacant_len() > 4096 && filled < 32768 {
            // Check crossfade trigger
            let remaining = dur - self.source_pos_secs;
            if self.crossfade_duration_secs > 0.0
                && remaining <= self.crossfade_duration_secs
                && remaining > 0.0
                && self.preloaded.is_some()
                && self.crossfade.is_none()
            {
                self.shared.set_position(self.source_pos_secs);
                return (false, true);
            }

            match dec.next_samples() {
                Ok(Some(samples)) => {
                    let decoded_frames = samples.len() / self.source_channels as usize;
                    self.source_pos_secs += decoded_frames as f64 / self.source_rate as f64;

                    let adapted =
                        adapt_channels(samples, self.source_channels, self.output_channels);
                    let resampled = if let Some(ref mut rs) = self.resampler {
                        rs.process(&adapted)
                    } else {
                        adapted
                    };
                    let mut out_samples = self.time_stretcher.process(&resampled);
                    self.equalizer
                        .process(&mut out_samples, self.output_channels);

                    // Mix in old track samples during crossfade
                    if let Some(ref mut cf) = self.crossfade {
                        decode_old_track(cf, out_samples.len(), self.output_channels);
                        mix_crossfade(
                            &mut out_samples,
                            &cf.leftover,
                            &mut cf.fade,
                            self.output_channels,
                        );
                        let consumed = out_samples.len().min(cf.leftover.len());
                        cf.leftover.drain(..consumed);
                        if cf.fade.is_complete() {
                            self.crossfade = None;
                        }
                    }

                    let mut pushed = 0;
                    for &s in &out_samples {
                        if prod.try_push(s).is_err() {
                            self.leftover.extend_from_slice(&out_samples[pushed..]);
                            break;
                        }
                        pushed += 1;
                    }
                    filled += pushed;
                }
                Ok(None) => {
                    // EOF
                    if self.crossfade.is_none() && self.preloaded.is_some() {
                        self.shared.set_position(self.source_pos_secs);
                        return (true, false);
                    }
                    if self.crossfade.is_none() {
                        self.shared.set_state(PlayState::Stopped);
                        let _ = self.app_handle.emit("audio:track-ended", ());
                        self.decoder = None;
                    }
                    break;
                }
                Err(e) => {
                    log::error!("Decode error: {}", e);
                    self.shared.set_state(PlayState::Stopped);
                    let _ = self.app_handle.emit("audio:error", e);
                    self.decoder = None;
                    break;
                }
            }
        }

        self.shared.set_position(self.source_pos_secs);
        (false, false)
    }

    fn begin_crossfade(&mut self) {
        let Some(old_dec) = self.decoder.take() else {
            return;
        };
        let Some((new_dec, new_rs, new_src_ch)) = self.preloaded.take() else {
            self.decoder = Some(old_dec);
            return;
        };

        let old_rs = self.resampler.take();
        let old_src_ch = self.source_channels;

        let dur = self.shared.get_duration();
        let actual_cf_secs = (dur - self.source_pos_secs)
            .min(self.crossfade_duration_secs)
            .max(0.0);

        // Hand off the current time_stretcher so the old track fades at the same speed
        let old_ts = std::mem::replace(
            &mut self.time_stretcher,
            TimeStretcher::new(self.output_channels),
        );
        self.time_stretcher.set_speed(self.current_speed);

        self.crossfade = Some(CrossfadeState::new(
            old_dec,
            old_rs,
            old_src_ch,
            old_ts,
            actual_cf_secs,
            self.output_rate,
            self.output_channels,
        ));

        self.install_track(new_dec, new_rs, new_src_ch);
    }

    fn do_gapless_transition(&mut self) {
        if let Some((next_dec, next_rs, next_src_ch)) = self.preloaded.take() {
            self.install_track(next_dec, next_rs, next_src_ch);
        }
    }

    /// Emit position events at ~20Hz using output-sample-based position.
    fn emit_position(&mut self) {
        if self.last_position_event.elapsed() < Duration::from_millis(50) {
            return;
        }
        self.last_position_event = std::time::Instant::now();

        let out = self.shared.out_samples.load(Ordering::Relaxed);
        let ch = self.shared.out_channels.load(Ordering::Relaxed).max(1);
        let rate = self.shared.out_rate.load(Ordering::Relaxed).max(1);
        let wall_secs = out as f64 / (rate as f64 * ch as f64);
        let playback_pos = self.playback_offset_secs + wall_secs * self.current_speed;
        let dur = self.shared.get_duration();
        let pos = playback_pos.min(dur).max(0.0);

        self.shared.set_position(pos);
        let _ = self.app_handle.emit(
            "audio:position",
            serde_json::json!({
                "position": pos,
                "duration": dur,
            }),
        );
    }
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
        leftover: Vec::new(),
        preloaded: None,
        crossfade: None,
        crossfade_duration_secs: 0.0,
        source_pos_secs: 0.0,
        playback_offset_secs: 0.0,
        current_speed: 1.0,
        last_position_event: std::time::Instant::now(),
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
        }

        // Don't busy-wait
        std::thread::sleep(Duration::from_millis(2));
    }
}
