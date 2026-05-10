use std::sync::atomic::Ordering;

use tauri::{Emitter, Runtime};

use super::super::crossfade::CrossfadeState;
use super::super::decoder::AudioDecoder;
use super::super::resampler::Resampler;
use super::super::time_stretch::TimeStretcher;
use super::EngineState;

impl<R: Runtime> EngineState<R> {
    /// Install a new track as the active decoder, resetting processing state.
    /// Shared by both crossfade and gapless transitions.
    pub(super) fn install_track(&mut self, dec: AudioDecoder, rs: Option<Resampler>, src_ch: u16) {
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

    pub(super) fn begin_crossfade(&mut self) {
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

    pub(super) fn do_gapless_transition(&mut self) {
        if let Some((next_dec, next_rs, next_src_ch)) = self.preloaded.take() {
            self.install_track(next_dec, next_rs, next_src_ch);
        }
    }
}
