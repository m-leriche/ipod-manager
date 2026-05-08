use super::decoder::AudioDecoder;
use super::resampler::Resampler;

/// Manages the fade-out side of a crossfade transition.
/// Holds the old track's decoder and resampler, and tracks fade progress.
pub struct CrossfadeState {
    pub decoder: AudioDecoder,
    pub resampler: Option<Resampler>,
    pub source_channels: u16,
    #[allow(dead_code)]
    pub source_rate: u32,
    /// Fade progress tracker (separated for testability).
    pub fade: FadeProgress,
}

impl CrossfadeState {
    pub fn new(
        decoder: AudioDecoder,
        resampler: Option<Resampler>,
        source_channels: u16,
        source_rate: u32,
        crossfade_duration_secs: f64,
        output_rate: u32,
        output_channels: u16,
    ) -> Self {
        let total_samples =
            (crossfade_duration_secs * output_rate as f64 * output_channels as f64) as usize;
        Self {
            decoder,
            resampler,
            source_channels,
            source_rate,
            fade: FadeProgress::new(total_samples),
        }
    }
}

/// Tracks crossfade progress and computes gain values.
/// Separated from CrossfadeState for testability (no decoder dependency).
pub struct FadeProgress {
    /// Total output samples (individual f32 values) for the crossfade region.
    total_samples: usize,
    /// Output samples mixed so far.
    progress_samples: usize,
}

impl FadeProgress {
    pub fn new(total_samples: usize) -> Self {
        Self {
            total_samples: total_samples.max(1),
            progress_samples: 0,
        }
    }

    /// Returns `(fade_in, fade_out)` gain factors for the current progress.
    /// Uses equal-power (cosine) crossfade for smooth perceived volume.
    pub fn gains(&self) -> (f32, f32) {
        crossfade_gains(self.progress_samples, self.total_samples)
    }

    /// Advance the progress counter by the given number of output samples.
    pub fn advance(&mut self, samples: usize) {
        self.progress_samples += samples;
    }

    /// Whether the crossfade has completed (all samples mixed).
    pub fn is_complete(&self) -> bool {
        self.progress_samples >= self.total_samples
    }
}

/// Compute equal-power crossfade gains for the given progress.
/// Returns `(fade_in, fade_out)` where `fade_in^2 + fade_out^2 ≈ 1`.
pub fn crossfade_gains(progress_samples: usize, total_samples: usize) -> (f32, f32) {
    let progress = if total_samples == 0 {
        1.0
    } else {
        (progress_samples as f64 / total_samples as f64).clamp(0.0, 1.0)
    };
    let angle = progress * std::f64::consts::FRAC_PI_2;
    (angle.sin() as f32, angle.cos() as f32)
}

/// Apply crossfade gains to a pair of sample buffers and mix them in place.
///
/// `new_samples` — fade-in (new track) buffer, modified in place with mixed output.
/// `old_samples` — fade-out (old track) buffer.
/// Both buffers must be interleaved at the output channel count/sample rate.
///
/// Returns the number of samples consumed from `old_samples`.
pub fn mix_crossfade(
    new_samples: &mut [f32],
    old_samples: &[f32],
    fade: &mut FadeProgress,
    output_channels: u16,
) -> usize {
    let ch = output_channels as usize;
    if ch == 0 {
        return 0;
    }
    let mut old_idx = 0;

    // Process frame-by-frame so fade gain changes per-frame, not per-sample
    for frame_start in (0..new_samples.len()).step_by(ch) {
        if fade.is_complete() || old_idx >= old_samples.len() {
            break;
        }

        let (fade_in, fade_out) = fade.gains();

        for c in 0..ch {
            let ni = frame_start + c;
            if ni >= new_samples.len() {
                break;
            }
            new_samples[ni] *= fade_in;
            if old_idx + c < old_samples.len() {
                new_samples[ni] += old_samples[old_idx + c] * fade_out;
            }
        }

        old_idx += ch;
        fade.advance(ch);
    }

    old_idx
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Gain curve tests ──────────────────────────────────────────

    #[test]
    fn gains_at_start() {
        let (fade_in, fade_out) = crossfade_gains(0, 1000);
        assert!((fade_in).abs() < 0.001, "fade_in at start should be ~0");
        assert!(
            (fade_out - 1.0).abs() < 0.001,
            "fade_out at start should be ~1"
        );
    }

    #[test]
    fn gains_at_midpoint() {
        let (fade_in, fade_out) = crossfade_gains(500, 1000);
        assert!(
            (fade_in - fade_out).abs() < 0.001,
            "fade_in and fade_out should be equal at midpoint"
        );
        assert!(
            (fade_in - 0.707).abs() < 0.01,
            "midpoint gain should be ~0.707"
        );
    }

    #[test]
    fn gains_at_end() {
        let (fade_in, fade_out) = crossfade_gains(1000, 1000);
        assert!((fade_in - 1.0).abs() < 0.001, "fade_in at end should be ~1");
        assert!((fade_out).abs() < 0.001, "fade_out at end should be ~0");
    }

    #[test]
    fn gains_clamp_past_end() {
        let (fade_in, fade_out) = crossfade_gains(2000, 1000);
        assert!((fade_in - 1.0).abs() < 0.001);
        assert!((fade_out).abs() < 0.001);
    }

    #[test]
    fn gains_zero_total_returns_full_in() {
        let (fade_in, fade_out) = crossfade_gains(0, 0);
        assert!((fade_in - 1.0).abs() < 0.001);
        assert!((fade_out).abs() < 0.001);
    }

    #[test]
    fn equal_power_preserves_energy_across_curve() {
        for i in 0..=100 {
            let (fade_in, fade_out) = crossfade_gains(i, 100);
            let energy = (fade_in as f64).powi(2) + (fade_out as f64).powi(2);
            assert!(
                (energy - 1.0).abs() < 0.01,
                "Energy not preserved at {}/100: {}",
                i,
                energy,
            );
        }
    }

    // ── FadeProgress tests ────────────────────────────────────────

    #[test]
    fn fade_progress_tracks_completion() {
        let mut fp = FadeProgress::new(10);
        assert!(!fp.is_complete());
        fp.advance(5);
        assert!(!fp.is_complete());
        fp.advance(5);
        assert!(fp.is_complete());
    }

    #[test]
    fn fade_progress_min_one_sample() {
        let fp = FadeProgress::new(0);
        assert_eq!(fp.total_samples, 1);
    }

    // ── mix_crossfade tests ───────────────────────────────────────

    #[test]
    fn mix_blends_stereo_frames() {
        // 4 samples = 2 frames at stereo, total crossfade = 8 samples
        let mut new_buf = vec![1.0_f32; 4];
        let old_buf = vec![1.0_f32; 4];
        let mut fade = FadeProgress::new(8);

        let consumed = mix_crossfade(&mut new_buf, &old_buf, &mut fade, 2);

        assert_eq!(consumed, 4);
        assert_eq!(fade.progress_samples, 4);

        // At start of crossfade: fade_in≈0, fade_out≈1 → output ≈ old (≈1.0)
        // First frame (progress=0/8): fade_in=0, fade_out=1 → 0*1 + 1*1 = 1
        assert!(
            (new_buf[0] - 1.0).abs() < 0.1,
            "First frame should be mostly old track"
        );
    }

    #[test]
    fn mix_handles_short_old_buffer() {
        let mut new_buf = vec![1.0_f32; 8]; // 4 frames stereo
        let old_buf = vec![0.5_f32; 2]; // only 1 frame
        let mut fade = FadeProgress::new(100);

        let consumed = mix_crossfade(&mut new_buf, &old_buf, &mut fade, 2);
        assert_eq!(consumed, 2);
    }

    #[test]
    fn mix_stops_when_crossfade_complete() {
        let mut new_buf = vec![1.0_f32; 8];
        let old_buf = vec![0.5_f32; 8];
        let mut fade = FadeProgress::new(4); // only 2 frames

        let consumed = mix_crossfade(&mut new_buf, &old_buf, &mut fade, 2);
        // Should stop after 4 samples (2 frames = total crossfade)
        assert_eq!(consumed, 4);
        assert!(fade.is_complete());
    }

    #[test]
    fn mix_mono() {
        let mut new_buf = vec![1.0_f32; 4];
        let old_buf = vec![1.0_f32; 4];
        let mut fade = FadeProgress::new(4);

        let consumed = mix_crossfade(&mut new_buf, &old_buf, &mut fade, 1);
        assert_eq!(consumed, 4);
        assert!(fade.is_complete());
    }

    #[test]
    fn mix_zero_channels_returns_zero() {
        let mut new_buf = vec![1.0_f32; 4];
        let old_buf = vec![1.0_f32; 4];
        let mut fade = FadeProgress::new(4);

        let consumed = mix_crossfade(&mut new_buf, &old_buf, &mut fade, 0);
        assert_eq!(consumed, 0);
    }

    #[test]
    fn full_crossfade_transitions_cleanly() {
        // Simulate a complete crossfade: old=1.0, new=0.5
        let total = 20; // 10 frames stereo
        let mut fade = FadeProgress::new(total);

        let mut all_output = Vec::new();

        // Process in chunks of 4 samples (2 frames)
        for _ in 0..5 {
            let mut new_chunk = vec![0.5_f32; 4];
            let old_chunk = vec![1.0_f32; 4];
            mix_crossfade(&mut new_chunk, &old_chunk, &mut fade, 2);
            all_output.extend_from_slice(&new_chunk);
        }

        assert!(fade.is_complete());

        // First samples should be dominated by old track (≈1.0)
        assert!(all_output[0] > 0.7, "Start should favor old track");
        // Last samples should be dominated by new track (≈0.5)
        assert!(
            all_output[all_output.len() - 1] < 0.7,
            "End should favor new track"
        );
    }
}
