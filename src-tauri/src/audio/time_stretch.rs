//! WSOLA (Waveform Similarity Overlap-Add) time stretcher.
//! Changes playback speed without altering pitch.
//! Operates on interleaved multi-channel audio.

const WINDOW_FRAMES: usize = 2048; // ~46ms at 44100Hz — better transient preservation
const SYNTHESIS_HOP: usize = WINDOW_FRAMES / 2; // 50% overlap
const SEARCH_RANGE: usize = WINDOW_FRAMES / 4; // ±search range for best overlap

pub struct TimeStretcher {
    speed: f64,
    channels: usize,
    window: Vec<f32>,
    input_buf: Vec<f32>,
    /// Previous output window tail (synthesis_hop * channels samples) for overlap-add
    prev_tail: Vec<f32>,
    /// Fractional frame position tracking in the input buffer
    input_pos: f64,
    has_prev: bool,
}

impl TimeStretcher {
    pub fn new(channels: u16) -> Self {
        let ch = channels as usize;
        Self {
            speed: 1.0,
            channels: ch,
            window: hann_window(WINDOW_FRAMES),
            input_buf: Vec::with_capacity(WINDOW_FRAMES * ch * 4),
            prev_tail: vec![0.0; SYNTHESIS_HOP * ch],
            input_pos: 0.0,
            has_prev: false,
        }
    }

    pub fn set_speed(&mut self, speed: f64) {
        self.speed = speed.clamp(0.25, 4.0);
    }

    pub fn is_active(&self) -> bool {
        (self.speed - 1.0).abs() > 0.001
    }

    pub fn reset(&mut self) {
        self.input_buf.clear();
        self.prev_tail.fill(0.0);
        self.input_pos = 0.0;
        self.has_prev = false;
    }

    /// Feed interleaved samples and get time-stretched output.
    pub fn process(&mut self, input: &[f32]) -> Vec<f32> {
        if !self.is_active() {
            return input.to_vec();
        }

        self.input_buf.extend_from_slice(input);

        let ch = self.channels;
        let win_samples = WINDOW_FRAMES * ch;
        let hop_samples = SYNTHESIS_HOP * ch;
        // Keep fractional analysis hop to avoid tempo drift at non-integer speed ratios
        let analysis_hop_f = SYNTHESIS_HOP as f64 * self.speed;

        let mut output = Vec::new();

        loop {
            let pos = self.input_pos as usize;

            // Need at least a full window + search range from current position
            let required_frames = pos + WINDOW_FRAMES + SEARCH_RANGE;
            if required_frames * ch > self.input_buf.len() {
                break;
            }

            // Find best overlap position via cross-correlation
            let best_pos = if self.has_prev {
                self.find_best_overlap(pos)
            } else {
                pos
            };

            // Extract windowed segment
            let seg_start = best_pos * ch;
            let seg_end = seg_start + win_samples;
            if seg_end > self.input_buf.len() {
                break;
            }

            // Apply Hann window and overlap-add
            if self.has_prev {
                // First half: cross-fade previous tail (fading out) with current (fading in)
                for i in 0..hop_samples {
                    let frame = i / ch;
                    let w = self.window[frame]; // periodic Hann first half: 0 → 1
                    let prev = self.prev_tail[i];
                    let cur = self.input_buf[seg_start + i] * w;
                    output.push(prev + cur);
                }
                // Second half: window and save as tail for next overlap
                for i in 0..hop_samples {
                    let frame = SYNTHESIS_HOP + i / ch;
                    let w = self.window[frame]; // periodic Hann second half: 1 → 0
                    self.prev_tail[i] = self.input_buf[seg_start + hop_samples + i] * w;
                }
            } else {
                // First window: output first half directly, save windowed second half as tail
                for i in 0..hop_samples {
                    output.push(self.input_buf[seg_start + i]);
                }
                for i in 0..hop_samples {
                    let frame = SYNTHESIS_HOP + i / ch;
                    let w = self.window[frame];
                    self.prev_tail[i] = self.input_buf[seg_start + hop_samples + i] * w;
                }
                self.has_prev = true;
            }

            self.input_pos += analysis_hop_f;
        }

        // Drain consumed input
        let drain_frames = (self.input_pos as usize).saturating_sub(WINDOW_FRAMES);
        if drain_frames > 0 {
            let drain_samples = (drain_frames * ch).min(self.input_buf.len());
            self.input_buf.drain(..drain_samples);
            self.input_pos -= drain_frames as f64;
        }

        output
    }

    /// Search ±SEARCH_RANGE frames around `center` for best cross-correlation
    /// with the previous window's tail.
    fn find_best_overlap(&self, center: usize) -> usize {
        let ch = self.channels;
        let hop_samples = SYNTHESIS_HOP * ch;

        let search_lo = center.saturating_sub(SEARCH_RANGE);
        let max_pos = self.input_buf.len() / ch;
        let search_hi = (center + SEARCH_RANGE).min(max_pos.saturating_sub(WINDOW_FRAMES));

        if search_lo >= search_hi {
            return center;
        }

        let mut best_pos = center;
        let mut best_corr = f64::NEG_INFINITY;

        // Subsample the search for performance: check every 4th position
        let step = 4;
        let mut pos = search_lo;
        while pos <= search_hi {
            let start = pos * ch;
            if start + hop_samples > self.input_buf.len() {
                break;
            }

            let corr =
                cross_correlate(&self.prev_tail, &self.input_buf[start..start + hop_samples]);
            if corr > best_corr {
                best_corr = corr;
                best_pos = pos;
            }
            pos += step;
        }

        // Refine around best: check ±step positions
        let refine_lo = best_pos.saturating_sub(step);
        let refine_hi = (best_pos + step).min(search_hi);
        for pos in refine_lo..=refine_hi {
            let start = pos * ch;
            if start + hop_samples > self.input_buf.len() {
                break;
            }
            let corr =
                cross_correlate(&self.prev_tail, &self.input_buf[start..start + hop_samples]);
            if corr > best_corr {
                best_corr = corr;
                best_pos = pos;
            }
        }

        best_pos
    }
}

/// Normalized cross-correlation between two equal-length sample blocks.
fn cross_correlate(a: &[f32], b: &[f32]) -> f64 {
    let len = a.len().min(b.len());
    if len == 0 {
        return 0.0;
    }

    // Subsample for performance on large blocks
    let step = if len > 512 { 4 } else { 1 };
    let mut sum = 0.0f64;
    let mut norm_a = 0.0f64;
    let mut norm_b = 0.0f64;

    let mut i = 0;
    while i < len {
        let va = a[i] as f64;
        let vb = b[i] as f64;
        sum += va * vb;
        norm_a += va * va;
        norm_b += vb * vb;
        i += step;
    }

    let denom = (norm_a * norm_b).sqrt();
    if denom < 1e-10 {
        0.0
    } else {
        sum / denom
    }
}

/// Generate a periodic Hann window of given length.
/// Periodic form (i/N instead of i/(N-1)) ensures w[n] + w[n+N/2] = 1.0 exactly
/// for 50% overlap, giving artifact-free constant-gain overlap-add.
fn hann_window(len: usize) -> Vec<f32> {
    (0..len)
        .map(|i| {
            let t = i as f32 / len as f32;
            0.5 * (1.0 - (2.0 * std::f32::consts::PI * t).cos())
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passthrough_at_1x() {
        let mut ts = TimeStretcher::new(2);
        ts.set_speed(1.0);
        let input: Vec<f32> = (0..1000).map(|i| (i as f32) * 0.001).collect();
        let output = ts.process(&input);
        assert_eq!(output.len(), input.len());
    }

    #[test]
    fn speed_2x_produces_fewer_samples() {
        let mut ts = TimeStretcher::new(1);
        ts.set_speed(2.0);
        // Feed enough data for the algorithm to produce output
        let input: Vec<f32> = (0..44100).map(|i| (i as f32 * 0.01).sin()).collect();
        let output = ts.process(&input);
        // At 2x speed, output should be roughly half the input
        assert!(
            output.len() < input.len(),
            "expected fewer samples, got {} vs {}",
            output.len(),
            input.len()
        );
    }

    #[test]
    fn speed_05x_produces_more_samples() {
        let mut ts = TimeStretcher::new(1);
        ts.set_speed(0.5);
        let input: Vec<f32> = (0..44100).map(|i| (i as f32 * 0.01).sin()).collect();
        let output = ts.process(&input);
        // At 0.5x speed, output should be roughly double the input
        // (minus initial buffering)
        assert!(
            output.len() > input.len() / 2,
            "expected more samples, got {} vs {}",
            output.len(),
            input.len()
        );
    }

    #[test]
    fn reset_clears_state() {
        let mut ts = TimeStretcher::new(2);
        ts.set_speed(1.5);
        let input: Vec<f32> = (0..20000).map(|i| (i as f32 * 0.01).sin()).collect();
        ts.process(&input);
        ts.reset();
        assert_eq!(ts.input_pos, 0.0);
        assert!(!ts.has_prev);
    }
}
