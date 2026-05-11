use rustfft::num_complex::Complex;
use rustfft::FftPlanner;
use std::sync::Arc;

const FFT_SIZE: usize = 2048;

/// Number of logarithmic frequency bands emitted to the frontend.
pub const NUM_BANDS: usize = 32;

/// Computes a frequency spectrum from audio samples via FFT.
/// Maintains a circular sample buffer, applies a Hann window,
/// and bins FFT output into logarithmic frequency bands.
pub struct SpectrumAnalyzer {
    buffer: Vec<f32>,
    write_pos: usize,
    window: Vec<f32>,
    fft: Arc<dyn rustfft::Fft<f32>>,
    scratch: Vec<Complex<f32>>,
}

impl SpectrumAnalyzer {
    pub fn new() -> Self {
        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(FFT_SIZE);
        let scratch_len = fft.get_inplace_scratch_len();

        let window: Vec<f32> = (0..FFT_SIZE)
            .map(|i| {
                let t = i as f32 / (FFT_SIZE - 1) as f32;
                0.5 * (1.0 - (2.0 * std::f32::consts::PI * t).cos())
            })
            .collect();

        Self {
            buffer: vec![0.0; FFT_SIZE],
            write_pos: 0,
            window,
            fft,
            scratch: vec![Complex::new(0.0, 0.0); scratch_len],
        }
    }

    /// Push interleaved audio samples, downmixing to mono.
    pub fn push_samples(&mut self, samples: &[f32], channels: u16) {
        let ch = channels as usize;
        if ch == 0 {
            return;
        }
        let frames = samples.len() / ch;
        for f in 0..frames {
            let mut sum = 0.0;
            for c in 0..ch {
                sum += samples[f * ch + c];
            }
            self.buffer[self.write_pos] = sum / ch as f32;
            self.write_pos = (self.write_pos + 1) % FFT_SIZE;
        }
    }

    /// Compute the spectrum and return `NUM_BANDS` magnitude values in 0.0..1.0.
    pub fn compute(&mut self) -> Vec<f32> {
        // Build windowed input from circular buffer (oldest -> newest)
        let mut input: Vec<Complex<f32>> = (0..FFT_SIZE)
            .map(|i| {
                let idx = (self.write_pos + i) % FFT_SIZE;
                Complex::new(self.buffer[idx] * self.window[i], 0.0)
            })
            .collect();

        self.fft.process_with_scratch(&mut input, &mut self.scratch);

        let half = FFT_SIZE / 2;
        let mut bands = Vec::with_capacity(NUM_BANDS);

        for band in 0..NUM_BANDS {
            // Quadratic mapping gives logarithmic frequency spacing
            let lo_f = (band as f32 / NUM_BANDS as f32).powi(2);
            let hi_f = ((band + 1) as f32 / NUM_BANDS as f32).powi(2);
            let lo = (half as f32 * lo_f) as usize;
            let hi = (half as f32 * hi_f) as usize;
            let lo = lo.max(1); // skip DC bin
            let hi = hi.max(lo + 1).min(half);

            let mut sum = 0.0f32;
            for c in &input[lo..hi] {
                let mag = (c.re.powi(2) + c.im.powi(2)).sqrt();
                sum += mag;
            }
            let avg = sum / (hi - lo) as f32;

            // Normalize to 0-1 using dB scale (-45dB..0dB -> 0.0..1.0)
            let normalized = avg / (FFT_SIZE as f32 / 2.0);
            let db = 20.0 * normalized.max(1e-10).log10();
            let value = ((db + 45.0) / 45.0).clamp(0.0, 1.0);
            bands.push(value);
        }

        bands
    }

    /// Reset the sample buffer (on seek or stop).
    pub fn reset(&mut self) {
        self.buffer.fill(0.0);
        self.write_pos = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn silence_produces_zero_bands() {
        let mut analyzer = SpectrumAnalyzer::new();
        let silence = vec![0.0f32; 4096];
        analyzer.push_samples(&silence, 2);
        let bands = analyzer.compute();
        assert_eq!(bands.len(), NUM_BANDS);
        for &v in &bands {
            assert!(v < 0.01, "silence should produce near-zero bands, got {v}");
        }
    }

    #[test]
    fn sine_wave_produces_nonzero_bands() {
        let mut analyzer = SpectrumAnalyzer::new();
        // 440Hz sine wave at 44100Hz sample rate, mono
        let samples: Vec<f32> = (0..4096)
            .map(|i| (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 44100.0).sin())
            .collect();
        analyzer.push_samples(&samples, 1);
        let bands = analyzer.compute();
        assert_eq!(bands.len(), NUM_BANDS);
        let max = bands.iter().cloned().fold(0.0f32, f32::max);
        assert!(
            max > 0.1,
            "440Hz sine should produce visible bands, max={max}"
        );
    }

    #[test]
    fn reset_clears_buffer() {
        let mut analyzer = SpectrumAnalyzer::new();
        let loud = vec![1.0f32; 4096];
        analyzer.push_samples(&loud, 1);
        analyzer.reset();
        let bands = analyzer.compute();
        for &v in &bands {
            assert!(v < 0.01, "reset should clear buffer, got {v}");
        }
    }
}
