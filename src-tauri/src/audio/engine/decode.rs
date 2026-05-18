use ringbuf::traits::{Observer, Producer};
use tauri::{Emitter, Runtime};

use super::super::crossfade::mix_crossfade;
use super::super::output::{adapt_channels, decode_old_track};
use super::super::types::PlayState;
use super::EngineState;

impl<R: Runtime> EngineState<R> {
    /// Decode audio samples and push them into the ring buffer.
    /// Returns `(gapless_transition, begin_crossfade)` flags.
    pub(super) fn decode_and_fill(&mut self) -> (bool, bool) {
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
                    // EOF — flush any leftover samples from the last decoded
                    // packet into the ring buffer so they aren't lost during
                    // the transition.
                    if !self.leftover.is_empty() {
                        let mut i = 0;
                        while i < self.leftover.len() {
                            if prod.try_push(self.leftover[i]).is_err() {
                                break;
                            }
                            i += 1;
                        }
                        self.leftover.drain(..i);
                    }

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
}
