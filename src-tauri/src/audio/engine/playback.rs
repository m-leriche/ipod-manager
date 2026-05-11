use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;

use cpal::traits::StreamTrait;
use ringbuf::traits::Split;
use ringbuf::HeapRb;
use tauri::{Emitter, Runtime};

use super::super::decoder::AudioDecoder;
use super::super::output::create_output_stream;
use super::super::resampler::Resampler;
use super::super::types::PlayState;
use super::EngineState;
use super::RING_BUFFER_SIZE;

impl<R: Runtime> EngineState<R> {
    pub(super) fn handle_play(&mut self, path: String, seek_secs: Option<f64>) {
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

    pub(super) fn stop_playback(&mut self) {
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
        self.spectrum.reset();
        self.shared.out_samples.store(0, Ordering::Relaxed);
        self.shared.set_position(0.0);
    }

    pub(super) fn handle_seek(&mut self, position_secs: f64) {
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
        self.spectrum.reset();
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

    pub(super) fn handle_set_speed(&mut self, speed: f64) {
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

    /// Emit position events at ~20Hz using output-sample-based position.
    pub(super) fn emit_position(&mut self) {
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

        let bands = self.spectrum.compute();
        let _ = self.app_handle.emit("audio:spectrum", &bands);
    }
}
