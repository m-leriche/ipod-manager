/// Simple linear-interpolation resampler for converting between sample rates.
/// Operates on interleaved multi-channel audio.
pub struct Resampler {
    ratio: f64,    // output_rate / source_rate
    channels: u16, // number of channels in the interleaved data
    /// Fractional position in the source (in frames)
    pos: f64,
    /// Previous frame (one sample per channel) for interpolation
    prev_frame: Vec<f32>,
}

impl Resampler {
    pub fn new(source_rate: u32, output_rate: u32, channels: u16) -> Self {
        Self {
            ratio: output_rate as f64 / source_rate as f64,
            channels,
            pos: 0.0,
            prev_frame: vec![0.0; channels as usize],
        }
    }

    /// Returns true if resampling is needed (rates differ).
    pub fn is_active(&self) -> bool {
        (self.ratio - 1.0).abs() > 0.0001
    }

    /// Reset state (call on seek).
    pub fn reset(&mut self) {
        self.pos = 0.0;
        self.prev_frame.fill(0.0);
    }

    /// Resample a block of interleaved samples.
    /// Returns a new Vec with the resampled interleaved output.
    pub fn process(&mut self, input: &[f32]) -> Vec<f32> {
        let ch = self.channels as usize;
        let in_frames = input.len() / ch;
        if in_frames == 0 {
            return Vec::new();
        }

        // Estimate output size
        let out_frames_est = ((in_frames as f64) * self.ratio).ceil() as usize + 2;
        let mut output = Vec::with_capacity(out_frames_est * ch);

        // Generate output frames by interpolating between source frames
        while self.pos < in_frames as f64 {
            let src_idx = self.pos.floor() as usize;
            let frac = (self.pos - src_idx as f64) as f32;

            for c in 0..ch {
                let a = if src_idx == 0 {
                    self.prev_frame[c]
                } else {
                    input[(src_idx - 1) * ch + c]
                };
                let b = if src_idx < in_frames {
                    input[src_idx * ch + c]
                } else {
                    // Past end — hold last sample
                    input[(in_frames - 1) * ch + c]
                };
                output.push(a + (b - a) * frac);
            }

            self.pos += 1.0 / self.ratio;
        }

        // Save last frame for next block's interpolation
        if in_frames > 0 {
            let last = (in_frames - 1) * ch;
            self.prev_frame.copy_from_slice(&input[last..last + ch]);
        }

        // Adjust pos to be relative to the next input block
        self.pos -= in_frames as f64;

        output
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passthrough_when_rates_equal() {
        let mut r = Resampler::new(44100, 44100, 2);
        assert!(!r.is_active());
        let input = vec![0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
        let output = r.process(&input);
        assert_eq!(output.len(), input.len());
    }

    #[test]
    fn downsample_2x_halves_frames() {
        let mut r = Resampler::new(96000, 48000, 1);
        assert!(r.is_active());
        // 8 input frames at 96k → ~4 output frames at 48k
        let input: Vec<f32> = (0..8).map(|i| i as f32).collect();
        let output = r.process(&input);
        // Should produce approximately 4 frames
        assert!(
            output.len() >= 3 && output.len() <= 5,
            "got {}",
            output.len()
        );
    }

    #[test]
    fn upsample_2x_doubles_frames() {
        let mut r = Resampler::new(22050, 44100, 1);
        assert!(r.is_active());
        let input: Vec<f32> = (0..4).map(|i| i as f32).collect();
        let output = r.process(&input);
        // Should produce approximately 8 frames
        assert!(
            output.len() >= 7 && output.len() <= 9,
            "got {}",
            output.len()
        );
    }
}
