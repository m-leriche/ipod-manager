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

    // Detect Bluetooth/wireless and set a base latency floor.
    // CoreAudio doesn't report BT transmission delay, so we add a fixed offset.
    let (transport, is_wireless) = detect_wireless_device();
    let bt_offset = if is_wireless {
        180_000u64 // 180ms for Bluetooth/AirPlay codec + transmission
    } else {
        0
    };
    output_latency_us.store(bt_offset, Ordering::Relaxed);
    log::info!(
        "Output device: transport={}, wireless={}, base latency={:.0}ms",
        transport,
        is_wireless,
        bt_offset as f64 / 1000.0,
    );

    let config = StreamConfig {
        channels,
        sample_rate: cpal::SampleRate(sample_rate),
        buffer_size: cpal::BufferSize::Default,
    };

    let stream = device
        .build_output_stream(
            &config,
            move |data: &mut [f32], info: &cpal::OutputCallbackInfo| {
                // Measure local buffer latency, capped at 500ms to ignore garbage.
                // Use max(cpal, bt_offset) so Bluetooth floor is never undercut.
                let ts = info.timestamp();
                if let Some(latency) = ts.playback.duration_since(&ts.callback) {
                    let us = latency.as_micros() as u64;
                    if us < 500_000 {
                        output_latency_us.store(us.max(bt_offset), Ordering::Relaxed);
                    }
                }

                let vol = f32::from_bits(volume.load(Ordering::Relaxed) as u32);
                let mut played: u64 = 0;
                for sample in data.iter_mut() {
                    let s = consumer.try_pop().unwrap_or(0.0);
                    *sample = s * vol;
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

// ── CoreAudio device transport type detection ───────────────────

/// Detect if the default output is wireless (Bluetooth, AirPlay, etc.).
/// Returns (transport_type_string, is_wireless).
fn detect_wireless_device() -> (String, bool) {
    match transport_type() {
        Some(t) => {
            let bytes = t.to_be_bytes();
            let label = String::from_utf8_lossy(&bytes).trim().to_string();
            const BLUETOOTH: u32 = u32::from_be_bytes(*b"blue");
            const BLUETOOTH_LE: u32 = u32::from_be_bytes(*b"blea");
            const AIRPLAY: u32 = u32::from_be_bytes(*b"airp");
            let wireless = t == BLUETOOTH || t == BLUETOOTH_LE || t == AIRPLAY;
            (label, wireless)
        }
        None => ("unknown".to_string(), false),
    }
}

/// Query the macOS default output device's transport type via CoreAudio.
fn transport_type() -> Option<u32> {
    #[repr(C)]
    struct AudioObjectPropertyAddress {
        selector: u32,
        scope: u32,
        element: u32,
    }

    const SYSTEM_OBJECT: u32 = 1;
    const SCOPE_GLOBAL: u32 = u32::from_be_bytes(*b"glob");
    const ELEMENT_MAIN: u32 = 0;
    const DEFAULT_OUTPUT: u32 = u32::from_be_bytes(*b"dout");
    const TRANSPORT_TYPE: u32 = u32::from_be_bytes(*b"tran");

    #[link(name = "CoreAudio", kind = "framework")]
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
        // Step 1: get default output device ID
        let addr = AudioObjectPropertyAddress {
            selector: DEFAULT_OUTPUT,
            scope: SCOPE_GLOBAL,
            element: ELEMENT_MAIN,
        };
        let mut device_id: u32 = 0;
        let mut size = 4u32;
        let status = AudioObjectGetPropertyData(
            SYSTEM_OBJECT,
            &addr,
            0,
            std::ptr::null(),
            &mut size,
            &mut device_id as *mut u32 as *mut std::ffi::c_void,
        );
        if status != 0 {
            log::warn!("CoreAudio: failed to get default output device (status={status})");
            return None;
        }

        // Step 2: get transport type
        let addr = AudioObjectPropertyAddress {
            selector: TRANSPORT_TYPE,
            scope: SCOPE_GLOBAL,
            element: ELEMENT_MAIN,
        };
        let mut transport: u32 = 0;
        let mut size = 4u32;
        let status = AudioObjectGetPropertyData(
            device_id,
            &addr,
            0,
            std::ptr::null(),
            &mut size,
            &mut transport as *mut u32 as *mut std::ffi::c_void,
        );
        if status != 0 {
            log::warn!(
                "CoreAudio: failed to get transport type for device {device_id} (status={status})"
            );
            return None;
        }

        Some(transport)
    }
}
