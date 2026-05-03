use std::sync::atomic::{AtomicU64, AtomicU8, Ordering};
use std::sync::Arc;
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Stream, StreamConfig};
use crossbeam_channel::Receiver;
use ringbuf::traits::{Consumer, Observer, Producer, Split};
use ringbuf::HeapRb;
use tauri::{AppHandle, Emitter, Runtime};

use super::decoder::AudioDecoder;
use super::equalizer::Equalizer;
use super::resampler::Resampler;
use super::time_stretch::TimeStretcher;
use super::types::{AudioCommand, PlayState};

/// Shared state between the engine thread, cpal callback, and Tauri commands.
pub struct SharedState {
    pub position: Arc<AtomicU64>,     // f64 bits: seconds
    pub duration: Arc<AtomicU64>,     // f64 bits: seconds
    pub state: Arc<AtomicU8>,         // PlayState as u8
    pub volume: Arc<AtomicU64>,       // f32 bits stored as u64 for atomic access
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
}

// Ring buffer size: ~500ms at 96kHz stereo (generous for high sample rates)
const RING_BUFFER_SIZE: usize = 96000 * 2;

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

    // Query the device's default output config — this is what CoreAudio actually supports
    let default_config = match device.default_output_config() {
        Ok(c) => c,
        Err(e) => {
            log::error!("No default output config: {}", e);
            return;
        }
    };
    let output_rate = default_config.sample_rate().0;
    let output_channels = default_config.channels();

    let mut current_stream: Option<Stream> = None;
    let mut decoder: Option<AudioDecoder> = None;
    let mut ring_producer: Option<ringbuf::HeapProd<f32>> = None;
    let mut resampler: Option<Resampler> = None;
    let mut equalizer = Equalizer::new(output_rate, output_channels);
    let mut time_stretcher = TimeStretcher::new(output_channels);
    let mut source_channels: u16 = 2;
    let mut source_rate: u32 = 44100;
    // Leftover samples from a partially-pushed decode packet
    let mut leftover: Vec<f32> = Vec::new();
    // Preloaded next track for gapless playback
    let mut preloaded: Option<(AudioDecoder, Option<Resampler>, u16)> = None;
    // Track source position directly (accurate at any speed)
    let mut source_pos_secs: f64 = 0.0;

    // Position event timer
    let mut last_position_event = std::time::Instant::now();

    loop {
        // Process all pending commands
        while let Ok(cmd) = cmd_rx.try_recv() {
            match cmd {
                AudioCommand::Play { path, seek_secs } => {
                    // Stop current playback
                    if let Some(stream) = current_stream.take() {
                        stream.pause().ok();
                    }
                    ring_producer = None;
                    decoder = None;
                    resampler = None;
                    preloaded = None;
                    leftover.clear();
                    equalizer.reset();
                    shared.out_samples.store(0, Ordering::Relaxed);
                    shared.set_position(0.0);

                    match AudioDecoder::open(&path) {
                        Ok(mut dec) => {
                            let src_rate = dec.sample_rate;
                            let src_ch = dec.channels;
                            let dur = dec.duration_secs;

                            shared.set_duration(dur);
                            shared
                                .out_channels
                                .store(output_channels as u64, Ordering::Relaxed);
                            shared.out_rate.store(output_rate as u64, Ordering::Relaxed);
                            source_channels = src_ch;
                            source_rate = src_rate;

                            // Create resampler if source and output rates differ
                            let rs = Resampler::new(src_rate, output_rate, output_channels);
                            if rs.is_active() {
                                resampler = Some(rs);
                            } else {
                                resampler = None;
                            }

                            // Seek if requested
                            source_pos_secs = 0.0;
                            if let Some(secs) = seek_secs {
                                if dec.seek(secs).is_ok() {
                                    source_pos_secs = secs;
                                    shared.set_position(secs);
                                }
                            }

                            // Create ring buffer and cpal stream using the device's native config
                            let rb = HeapRb::<f32>::new(RING_BUFFER_SIZE);
                            let (prod, cons) = rb.split();

                            match create_output_stream(
                                &device,
                                output_rate,
                                output_channels,
                                cons,
                                Arc::clone(&shared.volume),
                                Arc::clone(&shared.out_samples),
                            ) {
                                Ok(stream) => {
                                    stream.play().ok();
                                    current_stream = Some(stream);
                                    ring_producer = Some(prod);
                                    decoder = Some(dec);
                                    shared.set_state(PlayState::Playing);

                                    let _ = app_handle.emit("audio:duration-ready", dur);
                                }
                                Err(e) => {
                                    log::error!("Failed to create audio stream: {}", e);
                                    let _ = app_handle.emit("audio:error", e);
                                    shared.set_state(PlayState::Stopped);
                                }
                            }
                        }
                        Err(e) => {
                            log::error!("Failed to open audio: {}", e);
                            let _ = app_handle.emit("audio:error", e);
                            shared.set_state(PlayState::Stopped);
                        }
                    }
                }

                AudioCommand::Pause => {
                    if let Some(ref stream) = current_stream {
                        stream.pause().ok();
                    }
                    shared.set_state(PlayState::Paused);
                }

                AudioCommand::Resume => {
                    if let Some(ref stream) = current_stream {
                        stream.play().ok();
                    }
                    shared.set_state(PlayState::Playing);
                }

                AudioCommand::Stop => {
                    if let Some(stream) = current_stream.take() {
                        stream.pause().ok();
                    }
                    ring_producer = None;
                    decoder = None;
                    resampler = None;
                    preloaded = None;
                    leftover.clear();
                    shared.out_samples.store(0, Ordering::Relaxed);
                    shared.set_position(0.0);
                    shared.set_duration(0.0);
                    shared.set_state(PlayState::Stopped);
                }

                AudioCommand::Seek { position_secs } => {
                    if let Some(ref mut dec) = decoder {
                        if dec.seek(position_secs).is_ok() {
                            leftover.clear();
                            if let Some(ref mut rs) = resampler {
                                rs.reset();
                            }
                            time_stretcher.reset();
                            equalizer.reset();

                            // Clear ring buffer by dropping and recreating
                            if current_stream.is_some() {
                                let rb = HeapRb::<f32>::new(RING_BUFFER_SIZE);
                                let (prod, cons) = rb.split();

                                if let Some(stream) = current_stream.take() {
                                    stream.pause().ok();
                                }

                                match create_output_stream(
                                    &device,
                                    output_rate,
                                    output_channels,
                                    cons,
                                    Arc::clone(&shared.volume),
                                    Arc::clone(&shared.out_samples),
                                ) {
                                    Ok(stream) => {
                                        if shared.get_state() == PlayState::Playing {
                                            stream.play().ok();
                                        }
                                        current_stream = Some(stream);
                                        ring_producer = Some(prod);
                                    }
                                    Err(e) => {
                                        log::error!("Failed to recreate stream after seek: {}", e);
                                    }
                                }
                            }

                            source_pos_secs = position_secs;
                            shared.set_position(position_secs);
                        }
                    }
                }

                AudioCommand::SetVolume { volume } => {
                    shared.set_volume(volume.clamp(0.0, 1.0));
                }

                AudioCommand::PreloadNext { path } => match AudioDecoder::open(&path) {
                    Ok(dec) => {
                        let src_ch = dec.channels;
                        let rs = Resampler::new(dec.sample_rate, output_rate, output_channels);
                        let rs_opt = if rs.is_active() { Some(rs) } else { None };
                        preloaded = Some((dec, rs_opt, src_ch));
                    }
                    Err(e) => {
                        log::warn!("Failed to preload next track: {}", e);
                        preloaded = None;
                    }
                },

                AudioCommand::SetEq { config } => {
                    equalizer.update_config(&config);
                }

                AudioCommand::SetSpeed { speed } => {
                    time_stretcher.set_speed(speed);
                }

                AudioCommand::Shutdown => {
                    if let Some(stream) = current_stream.take() {
                        stream.pause().ok();
                    }
                    shared.set_state(PlayState::Stopped);
                    return;
                }
            }
        }

        // Decode and fill ring buffer if playing
        let mut gapless_transition = false;

        if shared.get_state() == PlayState::Playing {
            if let (Some(ref mut dec), Some(ref mut prod)) = (&mut decoder, &mut ring_producer) {
                // First, push any leftover samples from previous iteration
                let mut i = 0;
                while i < leftover.len() {
                    if prod.try_push(leftover[i]).is_err() {
                        break;
                    }
                    i += 1;
                }
                leftover.drain(..i);

                // Decode new packets while there's space
                if leftover.is_empty() {
                    let mut filled = 0;
                    while prod.vacant_len() > 4096 && filled < 32768 {
                        match dec.next_samples() {
                            Ok(Some(samples)) => {
                                // Track source position from decoded frames
                                let decoded_frames = samples.len() / source_channels as usize;
                                source_pos_secs += decoded_frames as f64 / source_rate as f64;

                                // Convert to output channel layout if needed
                                let adapted =
                                    adapt_channels(samples, source_channels, output_channels);
                                // Resample if source and output rates differ
                                let resampled = if let Some(ref mut rs) = resampler {
                                    rs.process(&adapted)
                                } else {
                                    adapted
                                };
                                // Time-stretch for speed control (pitch-preserving)
                                let mut out_samples = time_stretcher.process(&resampled);
                                // Apply EQ
                                equalizer.process(&mut out_samples, output_channels);
                                let mut pushed = 0;
                                for &s in &out_samples {
                                    if prod.try_push(s).is_err() {
                                        // Save remainder for next iteration
                                        leftover.extend_from_slice(&out_samples[pushed..]);
                                        break;
                                    }
                                    pushed += 1;
                                }
                                filled += pushed;
                            }
                            Ok(None) => {
                                // EOF — check for gapless transition
                                if preloaded.is_some() {
                                    gapless_transition = true;
                                } else {
                                    shared.set_state(PlayState::Stopped);
                                    let _ = app_handle.emit("audio:track-ended", ());
                                    decoder = None;
                                }
                                break;
                            }
                            Err(e) => {
                                log::error!("Decode error: {}", e);
                                shared.set_state(PlayState::Stopped);
                                let _ = app_handle.emit("audio:error", e);
                                decoder = None;
                                break;
                            }
                        }
                    }
                }

                // Update position from source decode tracking (accurate at any speed)
                shared.set_position(source_pos_secs);
            }

            // Handle gapless transition outside the borrow scope
            if gapless_transition {
                if let Some((next_dec, next_rs, next_src_ch)) = preloaded.take() {
                    let dur = next_dec.duration_secs;
                    source_rate = next_dec.sample_rate;
                    decoder = Some(next_dec);
                    resampler = next_rs;
                    source_channels = next_src_ch;
                    equalizer.reset();
                    time_stretcher.reset();
                    leftover.clear();
                    source_pos_secs = 0.0;
                    shared.set_position(0.0);
                    shared.set_duration(dur);
                    let _ = app_handle.emit("audio:gapless-transition", dur);
                }
            }

            // Emit position events at ~20Hz
            if last_position_event.elapsed() >= Duration::from_millis(50) {
                last_position_event = std::time::Instant::now();
                let pos = shared.get_position();
                let dur = shared.get_duration();
                let _ = app_handle.emit(
                    "audio:position",
                    serde_json::json!({
                        "position": pos,
                        "duration": dur,
                    }),
                );
            }
        }

        // Don't busy-wait — sleep briefly between iterations
        std::thread::sleep(Duration::from_millis(2));
    }
}

/// Adapt interleaved samples from source channel count to output channel count.
/// Returns a Vec with the converted samples.
fn adapt_channels(samples: &[f32], src_ch: u16, out_ch: u16) -> Vec<f32> {
    if src_ch == out_ch {
        return samples.to_vec();
    }

    let src = src_ch as usize;
    let out = out_ch as usize;
    let frames = samples.len() / src;
    let mut result = Vec::with_capacity(frames * out);

    for frame in 0..frames {
        let base = frame * src;
        for c in 0..out {
            if c < src {
                // Copy existing channel
                result.push(samples[base + c]);
            } else {
                // Duplicate first channel (mono→stereo upmix, etc.)
                result.push(samples[base]);
            }
        }
    }

    result
}

/// Create a cpal output stream that reads from a ring buffer consumer.
/// The output sample counter is incremented in the callback for accurate position tracking.
fn create_output_stream(
    device: &cpal::Device,
    sample_rate: u32,
    channels: u16,
    mut consumer: ringbuf::HeapCons<f32>,
    volume: Arc<AtomicU64>,
    out_samples: Arc<AtomicU64>,
) -> Result<Stream, String> {
    let config = StreamConfig {
        channels,
        sample_rate: cpal::SampleRate(sample_rate),
        buffer_size: cpal::BufferSize::Default,
    };

    let stream = device
        .build_output_stream(
            &config,
            move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                let vol = f32::from_bits(volume.load(Ordering::Relaxed) as u32);
                let mut played: u64 = 0;
                for sample in data.iter_mut() {
                    let s = consumer.try_pop().unwrap_or(0.0);
                    *sample = s * vol;
                    played += 1;
                }
                // Increment output counter — this tracks actual playback position
                out_samples.fetch_add(played, Ordering::Relaxed);
            },
            |err| {
                log::error!("Audio stream error: {}", err);
            },
            None,
        )
        .map_err(|e| format!("Failed to build output stream: {}", e))?;

    Ok(stream)
}
