use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use cpal::traits::{DeviceTrait, HostTrait};
use cpal::{Host, Stream, StreamConfig};
use ringbuf::traits::{Consumer, Producer};

use super::crossfade::CrossfadeState;

/// Decode samples from the old track during a crossfade into `cf.leftover`.
pub(super) fn decode_old_track(cf: &mut CrossfadeState, needed: usize, output_channels: u16) {
    while cf.leftover.len() < needed {
        match cf.decoder.next_samples() {
            Ok(Some(samples)) => {
                let adapted = adapt_channels(samples, cf.source_channels, output_channels);
                let resampled = if let Some(ref mut rs) = cf.resampler {
                    rs.process(&adapted)
                } else {
                    adapted
                };
                let stretched = cf.time_stretcher.process(&resampled);
                cf.leftover.extend_from_slice(&stretched);
            }
            // Old track ended or errored — just stop mixing
            Ok(None) | Err(_) => break,
        }
    }
}

/// Adapt interleaved samples from source channel count to output channel count.
pub(super) fn adapt_channels(samples: &[f32], src_ch: u16, out_ch: u16) -> Vec<f32> {
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
                result.push(samples[base + c]);
            } else {
                result.push(samples[base]);
            }
        }
    }

    result
}

/// Create a cpal output stream that reads from a ring buffer consumer.
/// Re-queries the default output device each time so audio follows
/// macOS system routing (e.g. Bluetooth speaker selection changes).
#[allow(clippy::too_many_arguments)]
pub(super) fn create_output_stream(
    host: &Host,
    sample_rate: u32,
    channels: u16,
    mut consumer: ringbuf::HeapCons<f32>,
    volume: Arc<AtomicU64>,
    out_samples: Arc<AtomicU64>,
    mut analysis_prod: ringbuf::HeapProd<f32>,
    output_latency_us: Arc<AtomicU64>,
) -> Result<Stream, String> {
    let device = host
        .default_output_device()
        .ok_or_else(|| "No audio output device found".to_string())?;

    // Query full device pipeline latency via CoreAudio (includes Bluetooth)
    let device_latency_us = query_device_latency_us(sample_rate);
    output_latency_us.store(device_latency_us, Ordering::Relaxed);
    log::info!(
        "Output device latency: {:.1}ms",
        device_latency_us as f64 / 1000.0
    );

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
                    // Mirror to analysis buffer for beat-accurate spectrum
                    let _ = analysis_prod.try_push(*sample);
                    played += 1;
                }
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

// ── CoreAudio device latency query ──────────────────────────────

/// Query the macOS default output device's total pipeline latency in microseconds.
/// Sums device latency + safety offset + buffer size (all in frames),
/// which captures Bluetooth codec/transport delays.
fn query_device_latency_us(sample_rate: u32) -> u64 {
    let frames = query_coreaudio_latency_frames().unwrap_or(0);
    if sample_rate == 0 {
        return 0;
    }
    (frames as f64 / sample_rate as f64 * 1_000_000.0) as u64
}

/// Raw CoreAudio FFI to get total output latency in frames.
fn query_coreaudio_latency_frames() -> Option<u32> {
    #[repr(C)]
    struct AudioObjectPropertyAddress {
        selector: u32,
        scope: u32,
        element: u32,
    }

    // CoreAudio constants
    const SYSTEM_OBJECT: u32 = 1;
    const SCOPE_GLOBAL: u32 = u32::from_be_bytes(*b"glob");
    const SCOPE_OUTPUT: u32 = u32::from_be_bytes(*b"outp");
    const ELEMENT_MAIN: u32 = 0;
    const DEFAULT_OUTPUT: u32 = u32::from_be_bytes(*b"dout");
    const DEVICE_LATENCY: u32 = u32::from_be_bytes(*b"ltnc");
    const SAFETY_OFFSET: u32 = u32::from_be_bytes(*b"saft");
    const BUFFER_SIZE: u32 = u32::from_be_bytes(*b"bsiz");

    extern "C" {
        fn AudioObjectGetPropertyData(
            id: u32,
            address: *const AudioObjectPropertyAddress,
            qualifier_size: u32,
            qualifier: *const std::ffi::c_void,
            data_size: *mut u32,
            data: *mut std::ffi::c_void,
        ) -> i32;
    }

    unsafe {
        let get_u32 = |id: u32, selector: u32, scope: u32| -> Option<u32> {
            let addr = AudioObjectPropertyAddress {
                selector,
                scope,
                element: ELEMENT_MAIN,
            };
            let mut value: u32 = 0;
            let mut size = 4u32;
            let status = AudioObjectGetPropertyData(
                id,
                &addr,
                0,
                std::ptr::null(),
                &mut size,
                &mut value as *mut u32 as *mut std::ffi::c_void,
            );
            if status == 0 {
                Some(value)
            } else {
                None
            }
        };

        let device_id = get_u32(SYSTEM_OBJECT, DEFAULT_OUTPUT, SCOPE_GLOBAL)?;
        let latency = get_u32(device_id, DEVICE_LATENCY, SCOPE_OUTPUT).unwrap_or(0);
        let safety = get_u32(device_id, SAFETY_OFFSET, SCOPE_OUTPUT).unwrap_or(0);
        let buffer = get_u32(device_id, BUFFER_SIZE, SCOPE_OUTPUT).unwrap_or(0);

        Some(latency + safety + buffer)
    }
}
