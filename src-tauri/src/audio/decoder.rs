use std::fs::File;
use std::path::Path;

use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{Decoder, DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::formats::{FormatOptions, FormatReader, SeekMode, SeekTo, Track};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::core::units::Time;

/// Wraps a symphonia FormatReader + Decoder for a single audio file.
pub struct AudioDecoder {
    reader: Box<dyn FormatReader>,
    decoder: Box<dyn Decoder>,
    track_id: u32,
    pub sample_rate: u32,
    pub channels: u16,
    pub duration_secs: f64,
    sample_buf: Option<SampleBuffer<f32>>,
}

impl AudioDecoder {
    /// Open an audio file and create a decoder.
    pub fn open(path: &str) -> Result<Self, String> {
        let file = File::open(path).map_err(|e| format!("Failed to open {}: {}", path, e))?;

        let mss = MediaSourceStream::new(Box::new(file), Default::default());

        let mut hint = Hint::new();
        if let Some(ext) = Path::new(path).extension().and_then(|e| e.to_str()) {
            hint.with_extension(ext);
        }

        let probed = symphonia::default::get_probe()
            .format(
                &hint,
                mss,
                &FormatOptions {
                    enable_gapless: true,
                    ..Default::default()
                },
                &MetadataOptions::default(),
            )
            .map_err(|e| format!("Failed to probe {}: {}", path, e))?;

        let reader = probed.format;

        let track = first_audio_track(reader.tracks())
            .ok_or_else(|| format!("No audio track in {}", path))?;

        let track_id = track.id;
        let params = &track.codec_params;

        let sample_rate = params.sample_rate.unwrap_or(44100);
        let channels = params.channels.map(|c| c.count() as u16).unwrap_or(2);

        let duration_secs = if let Some(n_frames) = params.n_frames {
            n_frames as f64 / sample_rate as f64
        } else if let Some(tb) = params.time_base {
            if let Some(dur) = params.n_frames {
                tb.calc_time(dur).seconds as f64 + tb.calc_time(dur).frac
            } else {
                0.0
            }
        } else {
            0.0
        };

        let decoder = symphonia::default::get_codecs()
            .make(params, &DecoderOptions::default())
            .map_err(|e| format!("Failed to create decoder: {}", e))?;

        Ok(Self {
            reader,
            decoder,
            track_id,
            sample_rate,
            channels,
            duration_secs,
            sample_buf: None,
        })
    }

    /// Decode the next packet and return interleaved f32 samples.
    /// Returns Ok(None) on EOF.
    pub fn next_samples(&mut self) -> Result<Option<&[f32]>, String> {
        loop {
            let packet = match self.reader.next_packet() {
                Ok(p) => p,
                Err(symphonia::core::errors::Error::IoError(ref e))
                    if e.kind() == std::io::ErrorKind::UnexpectedEof =>
                {
                    return Ok(None); // EOF
                }
                Err(e) => return Err(format!("Read error: {}", e)),
            };

            // Skip packets for other tracks
            if packet.track_id() != self.track_id {
                continue;
            }

            let decoded = match self.decoder.decode(&packet) {
                Ok(d) => d,
                Err(symphonia::core::errors::Error::DecodeError(msg)) => {
                    log::warn!("Decode error (skipping packet): {}", msg);
                    continue;
                }
                Err(e) => return Err(format!("Decode error: {}", e)),
            };

            let spec = *decoded.spec();
            let num_frames = decoded.capacity();

            // Reuse or create sample buffer
            let buf = self
                .sample_buf
                .get_or_insert_with(|| SampleBuffer::new(num_frames as u64, spec));

            // Resize if needed
            if buf.capacity() < num_frames {
                *buf = SampleBuffer::new(num_frames as u64, spec);
            }

            buf.copy_interleaved_ref(decoded);
            return Ok(Some(buf.samples()));
        }
    }

    /// Seek to a position in seconds.
    pub fn seek(&mut self, seconds: f64) -> Result<(), String> {
        let time = Time {
            seconds: seconds as u64,
            frac: seconds.fract(),
        };

        self.reader
            .seek(
                SeekMode::Accurate,
                SeekTo::Time {
                    time,
                    track_id: None,
                },
            )
            .map_err(|e| format!("Seek error: {}", e))?;

        // Reset the decoder after seeking
        self.decoder.reset();

        Ok(())
    }
}

fn first_audio_track(tracks: &[Track]) -> Option<&Track> {
    tracks
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
}
