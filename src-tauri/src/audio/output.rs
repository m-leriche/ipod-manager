use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use cpal::traits::{DeviceTrait, HostTrait};
use cpal::{Host, Stream, StreamConfig};
use ringbuf::traits::Consumer;

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
pub(super) fn create_output_stream(
    host: &Host,
    sample_rate: u32,
    channels: u16,
    mut consumer: ringbuf::HeapCons<f32>,
    volume: Arc<AtomicU64>,
    out_samples: Arc<AtomicU64>,
) -> Result<Stream, String> {
    let device = host
        .default_output_device()
        .ok_or_else(|| "No audio output device found".to_string())?;

    let config = StreamConfig {
        channels,
        sample_rate: cpal::SampleRate(sample_rate),
        buffer_size: cpal::BufferSize::Default,
    };

    let stream = device
        .build_output_stream(
            &config,
            move |data: &mut [f32], _info: &cpal::OutputCallbackInfo| {
                let vol = f32::from_bits(volume.load(Ordering::Relaxed) as u32);
                let mut played: u64 = 0;
                for sample in data.iter_mut() {
                    let s = consumer.try_pop().unwrap_or(0.0);
                    *sample = s * vol;
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
