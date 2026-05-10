use std::path::Path;

use crate::localvideo::sanitize_filename;

use super::ConvertRequest;

pub(super) fn build_codec_args(req: &ConvertRequest) -> Vec<String> {
    match req.target_format.as_str() {
        "mp3" => {
            let bitrate = req.mp3_bitrate.unwrap_or(320);
            vec![
                "-acodec".to_string(),
                "libmp3lame".to_string(),
                "-b:a".to_string(),
                format!("{}k", bitrate),
            ]
        }
        "flac" => {
            let mut args = vec!["-acodec".to_string(), "flac".to_string()];
            if let Some(sr) = req.flac_sample_rate {
                args.extend(["-ar".to_string(), sr.to_string()]);
            }
            if let Some(bd) = req.flac_bit_depth {
                let sample_fmt = match bd {
                    16 => "s16",
                    24 => "s32",
                    _ => "s16",
                };
                args.extend(["-sample_fmt".to_string(), sample_fmt.to_string()]);
            }
            args
        }
        _ => vec![],
    }
}

pub(super) fn build_output_path(input_path: &str, output_dir: &str, target_format: &str) -> String {
    let stem = Path::new(input_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("converted");
    let stem = sanitize_filename(stem);
    let base = format!("{}/{}.{}", output_dir, stem, target_format);
    if !Path::new(&base).exists() {
        return base;
    }
    for i in 1.. {
        let candidate = format!("{}/{} ({}).{}", output_dir, stem, i, target_format);
        if !Path::new(&candidate).exists() {
            return candidate;
        }
    }
    base
}

pub(super) fn parse_ffmpeg_time(time_str: &str) -> Option<f64> {
    let parts: Vec<&str> = time_str.trim().split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let h: f64 = parts[0].parse().ok()?;
    let m: f64 = parts[1].parse().ok()?;
    let s: f64 = parts[2].parse().ok()?;
    let secs = h * 3600.0 + m * 60.0 + s;
    if secs >= 0.0 {
        Some(secs)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_codec_args_mp3_320() {
        let req = ConvertRequest {
            input_path: "test.flac".to_string(),
            output_dir: "/tmp".to_string(),
            target_format: "mp3".to_string(),
            mp3_bitrate: Some(320),
            flac_sample_rate: None,
            flac_bit_depth: None,
        };
        let args = build_codec_args(&req);
        assert_eq!(args, vec!["-acodec", "libmp3lame", "-b:a", "320k"]);
    }

    #[test]
    fn build_codec_args_mp3_128() {
        let req = ConvertRequest {
            input_path: "test.flac".to_string(),
            output_dir: "/tmp".to_string(),
            target_format: "mp3".to_string(),
            mp3_bitrate: Some(128),
            flac_sample_rate: None,
            flac_bit_depth: None,
        };
        let args = build_codec_args(&req);
        assert_eq!(args, vec!["-acodec", "libmp3lame", "-b:a", "128k"]);
    }

    #[test]
    fn build_codec_args_flac_16_44() {
        let req = ConvertRequest {
            input_path: "test.flac".to_string(),
            output_dir: "/tmp".to_string(),
            target_format: "flac".to_string(),
            mp3_bitrate: None,
            flac_sample_rate: Some(44100),
            flac_bit_depth: Some(16),
        };
        let args = build_codec_args(&req);
        assert_eq!(
            args,
            vec!["-acodec", "flac", "-ar", "44100", "-sample_fmt", "s16"]
        );
    }

    #[test]
    fn build_codec_args_flac_24_96() {
        let req = ConvertRequest {
            input_path: "test.flac".to_string(),
            output_dir: "/tmp".to_string(),
            target_format: "flac".to_string(),
            mp3_bitrate: None,
            flac_sample_rate: Some(96000),
            flac_bit_depth: Some(24),
        };
        let args = build_codec_args(&req);
        assert_eq!(
            args,
            vec!["-acodec", "flac", "-ar", "96000", "-sample_fmt", "s32"]
        );
    }

    #[test]
    fn build_codec_args_flac_original() {
        let req = ConvertRequest {
            input_path: "test.flac".to_string(),
            output_dir: "/tmp".to_string(),
            target_format: "flac".to_string(),
            mp3_bitrate: None,
            flac_sample_rate: None,
            flac_bit_depth: None,
        };
        let args = build_codec_args(&req);
        assert_eq!(args, vec!["-acodec", "flac"]);
    }

    #[test]
    fn build_output_path_no_collision() {
        let path = build_output_path("/music/song.flac", "/tmp/nonexistent_dir_xyz", "mp3");
        assert!(path.ends_with("/song.mp3"));
    }
}
