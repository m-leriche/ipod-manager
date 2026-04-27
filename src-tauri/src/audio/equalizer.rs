use super::types::EqConfig;

/// A single biquad filter with per-channel state.
/// Uses f64 internally to avoid accumulated floating-point drift in the recursive equation.
/// Coefficients are derived from the Audio EQ Cookbook by Robert Bristow-Johnson.
struct BiquadFilter {
    // Normalized coefficients (already divided by a0)
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
    // Per-channel state: [x[n-1], x[n-2], y[n-1], y[n-2]]
    state: Vec<[f64; 4]>,
}

impl BiquadFilter {
    fn new(
        filter_type: &str,
        frequency: f32,
        gain_db: f32,
        q: f32,
        sample_rate: u32,
        channels: u16,
    ) -> Self {
        let mut f = Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
            state: vec![[0.0; 4]; channels as usize],
        };
        f.compute_coefficients(filter_type, frequency, gain_db, q, sample_rate);
        f
    }

    fn compute_coefficients(
        &mut self,
        filter_type: &str,
        frequency: f32,
        gain_db: f32,
        q: f32,
        sample_rate: u32,
    ) {
        let fs = sample_rate as f64;
        let f0 = (frequency as f64).clamp(1.0, fs * 0.49); // stay below Nyquist
        let db = gain_db as f64;
        let q_val = (q as f64).max(0.01);

        let a_lin = 10.0_f64.powf(db / 40.0); // sqrt of linear gain
        let w0 = 2.0 * std::f64::consts::PI * f0 / fs;
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / (2.0 * q_val);

        let (b0, b1, b2, a0, a1, a2) = match filter_type {
            "lowshelf" => {
                let two_sqrt_a_alpha = 2.0 * a_lin.sqrt() * alpha;
                (
                    a_lin * ((a_lin + 1.0) - (a_lin - 1.0) * cos_w0 + two_sqrt_a_alpha),
                    2.0 * a_lin * ((a_lin - 1.0) - (a_lin + 1.0) * cos_w0),
                    a_lin * ((a_lin + 1.0) - (a_lin - 1.0) * cos_w0 - two_sqrt_a_alpha),
                    (a_lin + 1.0) + (a_lin - 1.0) * cos_w0 + two_sqrt_a_alpha,
                    -2.0 * ((a_lin - 1.0) + (a_lin + 1.0) * cos_w0),
                    (a_lin + 1.0) + (a_lin - 1.0) * cos_w0 - two_sqrt_a_alpha,
                )
            }
            "highshelf" => {
                let two_sqrt_a_alpha = 2.0 * a_lin.sqrt() * alpha;
                (
                    a_lin * ((a_lin + 1.0) + (a_lin - 1.0) * cos_w0 + two_sqrt_a_alpha),
                    -2.0 * a_lin * ((a_lin - 1.0) + (a_lin + 1.0) * cos_w0),
                    a_lin * ((a_lin + 1.0) + (a_lin - 1.0) * cos_w0 - two_sqrt_a_alpha),
                    (a_lin + 1.0) - (a_lin - 1.0) * cos_w0 + two_sqrt_a_alpha,
                    2.0 * ((a_lin - 1.0) - (a_lin + 1.0) * cos_w0),
                    (a_lin + 1.0) - (a_lin - 1.0) * cos_w0 - two_sqrt_a_alpha,
                )
            }
            _ => {
                // "peaking" (default)
                (
                    1.0 + alpha * a_lin,
                    -2.0 * cos_w0,
                    1.0 - alpha * a_lin,
                    1.0 + alpha / a_lin,
                    -2.0 * cos_w0,
                    1.0 - alpha / a_lin,
                )
            }
        };

        // Normalize by a0
        let inv_a0 = 1.0 / a0;
        self.b0 = b0 * inv_a0;
        self.b1 = b1 * inv_a0;
        self.b2 = b2 * inv_a0;
        self.a1 = a1 * inv_a0;
        self.a2 = a2 * inv_a0;
    }

    /// Process interleaved samples in-place. Each frame has `channels` samples.
    fn process(&mut self, samples: &mut [f32], channels: u16) {
        let ch = channels as usize;
        for i in (0..samples.len()).step_by(ch) {
            for c in 0..ch {
                if i + c >= samples.len() {
                    break;
                }
                let st = &mut self.state[c];
                let x0 = samples[i + c] as f64;
                let y0 = self.b0 * x0 + self.b1 * st[0] + self.b2 * st[1]
                    - self.a1 * st[2]
                    - self.a2 * st[3];
                // Shift state
                st[1] = st[0]; // x[n-2] = x[n-1]
                st[0] = x0; // x[n-1] = x[n]
                st[3] = st[2]; // y[n-2] = y[n-1]
                st[2] = y0; // y[n-1] = y[n]
                samples[i + c] = y0 as f32;
            }
        }
    }

    fn reset(&mut self) {
        for st in &mut self.state {
            *st = [0.0; 4];
        }
    }
}

/// Multi-band equalizer that processes interleaved f32 audio samples.
pub struct Equalizer {
    filters: Vec<BiquadFilter>,
    preamp: f32, // linear gain
    enabled: bool,
    sample_rate: u32,
    channels: u16,
}

impl Equalizer {
    pub fn new(sample_rate: u32, channels: u16) -> Self {
        Self {
            filters: Vec::new(),
            preamp: 1.0,
            enabled: false,
            sample_rate,
            channels,
        }
    }

    /// Update the entire EQ configuration. Rebuilds all filter coefficients.
    pub fn update_config(&mut self, config: &EqConfig) {
        self.enabled = config.enabled;
        self.preamp = db_to_linear(config.preamp_db);

        // Rebuild filters only if band count or params changed
        self.filters = config
            .bands
            .iter()
            .map(|band| {
                BiquadFilter::new(
                    &band.filter_type,
                    band.frequency,
                    band.gain_db,
                    band.q,
                    self.sample_rate,
                    self.channels,
                )
            })
            .collect();
    }

    /// Process interleaved f32 samples in-place.
    pub fn process(&mut self, samples: &mut [f32], channels: u16) {
        if !self.enabled || self.filters.is_empty() {
            return;
        }

        // Apply preamp
        if (self.preamp - 1.0).abs() > f32::EPSILON {
            for s in samples.iter_mut() {
                *s *= self.preamp;
            }
        }

        // Apply each filter in series
        for filter in &mut self.filters {
            filter.process(samples, channels);
        }
    }

    /// Reset all filter state (call on seek or track change to avoid transients).
    pub fn reset(&mut self) {
        for filter in &mut self.filters {
            filter.reset();
        }
    }
}

fn db_to_linear(db: f32) -> f32 {
    10.0_f32.powf(db / 20.0)
}

// ── Tests ──────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::types::{EqBand, EqConfig};

    fn make_config(enabled: bool, preamp_db: f32, bands: Vec<EqBand>) -> EqConfig {
        EqConfig {
            enabled,
            preamp_db,
            bands,
        }
    }

    fn peaking_band(frequency: f32, gain_db: f32, q: f32) -> EqBand {
        EqBand {
            filter_type: "peaking".to_string(),
            frequency,
            gain_db,
            q,
        }
    }

    #[test]
    fn disabled_eq_passes_through() {
        let mut eq = Equalizer::new(44100, 2);
        eq.update_config(&make_config(
            false,
            0.0,
            vec![peaking_band(1000.0, 6.0, 1.0)],
        ));

        let original = vec![0.5_f32, -0.3, 0.8, -0.1];
        let mut samples = original.clone();
        eq.process(&mut samples, 2);

        assert_eq!(samples, original);
    }

    #[test]
    fn preamp_scales_signal() {
        let mut eq = Equalizer::new(44100, 2);
        // +6dB preamp ≈ 2x gain, no filter bands
        eq.update_config(&make_config(true, 6.0, vec![]));

        // No bands = early return, so preamp alone won't apply.
        // Need at least one band for process to run through.
        // Use a flat band (0dB gain) so only preamp affects the signal.
        eq.update_config(&make_config(
            true,
            6.0,
            vec![peaking_band(1000.0, 0.0, 1.0)],
        ));

        let mut samples = vec![0.5_f32, 0.5];
        eq.process(&mut samples, 2);

        // +6dB ≈ 1.995x. Allow some tolerance from filter transient on first sample.
        let expected = 0.5 * db_to_linear(6.0);
        for &s in &samples {
            assert!(
                (s - expected).abs() < 0.05,
                "sample {} not near {}",
                s,
                expected
            );
        }
    }

    #[test]
    fn peaking_filter_boosts_signal() {
        let mut eq = Equalizer::new(44100, 1);
        eq.update_config(&make_config(
            true,
            0.0,
            vec![peaking_band(1000.0, 12.0, 1.0)],
        ));

        // Generate 1kHz sine at 44100Hz (mono)
        let num_samples = 4410; // 100ms
        let mut samples: Vec<f32> = (0..num_samples)
            .map(|i| {
                let t = i as f32 / 44100.0;
                (2.0 * std::f32::consts::PI * 1000.0 * t).sin() * 0.1
            })
            .collect();

        let input_rms = rms(&samples);
        eq.process(&mut samples, 1);
        let output_rms = rms(&samples[441..]); // skip transient

        // +12dB should roughly 4x the RMS at the center frequency
        let gain_ratio = output_rms / input_rms;
        assert!(
            gain_ratio > 2.5,
            "Expected significant boost at 1kHz, got ratio {}",
            gain_ratio
        );
    }

    #[test]
    fn lowshelf_boosts_low_frequencies() {
        let mut eq = Equalizer::new(44100, 1);
        eq.update_config(&make_config(
            true,
            0.0,
            vec![EqBand {
                filter_type: "lowshelf".to_string(),
                frequency: 200.0,
                gain_db: 12.0,
                q: 0.71,
            }],
        ));

        // 100Hz sine (below shelf frequency) — should be boosted
        let num_samples = 4410;
        let mut low: Vec<f32> = (0..num_samples)
            .map(|i| (2.0 * std::f32::consts::PI * 100.0 * i as f32 / 44100.0).sin() * 0.1)
            .collect();
        let low_input_rms = rms(&low);
        eq.process(&mut low, 1);
        let low_output_rms = rms(&low[441..]);

        eq.reset();

        // 4kHz sine (above shelf) — should pass through ~unchanged
        let mut high: Vec<f32> = (0..num_samples)
            .map(|i| (2.0 * std::f32::consts::PI * 4000.0 * i as f32 / 44100.0).sin() * 0.1)
            .collect();
        let high_input_rms = rms(&high);
        eq.process(&mut high, 1);
        let high_output_rms = rms(&high[441..]);

        let low_gain = low_output_rms / low_input_rms;
        let high_gain = high_output_rms / high_input_rms;

        assert!(
            low_gain > 2.5,
            "Low shelf should boost 100Hz, got ratio {}",
            low_gain
        );
        assert!(
            high_gain < 1.5,
            "Low shelf shouldn't boost 4kHz, got ratio {}",
            high_gain
        );
    }

    #[test]
    fn multichannel_filters_independently() {
        let mut eq = Equalizer::new(44100, 2);
        eq.update_config(&make_config(
            true,
            0.0,
            vec![peaking_band(1000.0, 6.0, 1.0)],
        ));

        // Stereo: left = 1kHz sine, right = silence
        let num_frames = 2205;
        let mut samples: Vec<f32> = Vec::with_capacity(num_frames * 2);
        for i in 0..num_frames {
            let t = i as f32 / 44100.0;
            let left = (2.0 * std::f32::consts::PI * 1000.0 * t).sin() * 0.1;
            samples.push(left);
            samples.push(0.0); // right channel silent
        }

        eq.process(&mut samples, 2);

        // Right channel should remain ~0
        let right_samples: Vec<f32> = samples.iter().skip(1).step_by(2).copied().collect();
        let right_rms = rms(&right_samples);
        assert!(
            right_rms < 0.001,
            "Right channel should stay silent, got rms {}",
            right_rms
        );
    }

    #[test]
    fn reset_clears_state() {
        let mut eq = Equalizer::new(44100, 1);
        eq.update_config(&make_config(
            true,
            0.0,
            vec![peaking_band(1000.0, 6.0, 1.0)],
        ));

        // Process some signal to build up filter state
        let mut samples: Vec<f32> = (0..441)
            .map(|i| (2.0 * std::f32::consts::PI * 1000.0 * i as f32 / 44100.0).sin() * 0.5)
            .collect();
        eq.process(&mut samples, 1);

        // State should be non-zero
        let has_state = eq
            .filters
            .iter()
            .any(|f| f.state.iter().any(|s| s.iter().any(|v| *v != 0.0)));
        assert!(
            has_state,
            "Filter should have non-zero state after processing"
        );

        eq.reset();

        let all_zero = eq
            .filters
            .iter()
            .all(|f| f.state.iter().all(|s| s.iter().all(|v| *v == 0.0)));
        assert!(all_zero, "Filter state should be zero after reset");
    }

    fn rms(samples: &[f32]) -> f32 {
        if samples.is_empty() {
            return 0.0;
        }
        let sum_sq: f32 = samples.iter().map(|s| s * s).sum();
        (sum_sq / samples.len() as f32).sqrt()
    }
}
