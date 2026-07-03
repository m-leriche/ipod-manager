use serde::{Deserialize, Serialize};
use std::path::Path;

/// MP3 encoding target for lossless-to-MP3 sync transcoding.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum TranscodeBitrate {
    #[default]
    #[serde(rename = "320")]
    Cbr320,
    #[serde(rename = "v0")]
    V0,
}

const LOSSLESS_EXTENSIONS: [&str; 5] = ["flac", "wav", "aiff", "aif", "alac"];

/// Whether a path points at a lossless audio file, judged by extension.
pub fn is_lossless(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|ext| LOSSLESS_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
}

/// Destination path for a transcoded file: same path, `.mp3` extension.
pub fn mp3_dest_path(dest: &str) -> String {
    Path::new(dest)
        .with_extension("mp3")
        .to_string_lossy()
        .to_string()
}

/// ffmpeg codec arguments for the given MP3 target.
pub fn mp3_codec_args(bitrate: TranscodeBitrate) -> Vec<String> {
    let quality_args = match bitrate {
        TranscodeBitrate::Cbr320 => ["-b:a", "320k"],
        TranscodeBitrate::V0 => ["-q:a", "0"],
    };
    let mut args = vec!["-acodec".to_string(), "libmp3lame".to_string()];
    args.extend(quality_args.iter().map(|s| s.to_string()));
    args
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lossless_extensions_detected() {
        assert!(is_lossless("Artist/Album/song.flac"));
        assert!(is_lossless("song.wav"));
        assert!(is_lossless("song.aiff"));
        assert!(is_lossless("song.aif"));
        assert!(is_lossless("song.alac"));
    }

    #[test]
    fn lossless_detection_is_case_insensitive() {
        assert!(is_lossless("song.FLAC"));
        assert!(is_lossless("song.Wav"));
    }

    #[test]
    fn lossy_and_extensionless_are_not_lossless() {
        assert!(!is_lossless("song.mp3"));
        assert!(!is_lossless("song.m4a"));
        assert!(!is_lossless("song.ogg"));
        assert!(!is_lossless("noextension"));
        assert!(!is_lossless("archive.flac.zip"));
    }

    #[test]
    fn mp3_dest_path_replaces_extension() {
        assert_eq!(
            mp3_dest_path("/ipod/Artist/song.flac"),
            "/ipod/Artist/song.mp3"
        );
        assert_eq!(mp3_dest_path("Artist/song.wav"), "Artist/song.mp3");
    }

    #[test]
    fn mp3_dest_path_keeps_dots_in_stem() {
        assert_eq!(
            mp3_dest_path("Artist/01. Intro.flac"),
            "Artist/01. Intro.mp3"
        );
    }

    #[test]
    fn codec_args_320_cbr() {
        assert_eq!(
            mp3_codec_args(TranscodeBitrate::Cbr320),
            vec!["-acodec", "libmp3lame", "-b:a", "320k"]
        );
    }

    #[test]
    fn codec_args_v0_vbr() {
        assert_eq!(
            mp3_codec_args(TranscodeBitrate::V0),
            vec!["-acodec", "libmp3lame", "-q:a", "0"]
        );
    }

    #[test]
    fn bitrate_serde_round_trip() {
        assert_eq!(
            serde_json::to_string(&TranscodeBitrate::Cbr320).expect("serialize"),
            "\"320\""
        );
        assert_eq!(
            serde_json::from_str::<TranscodeBitrate>("\"v0\"").expect("deserialize"),
            TranscodeBitrate::V0
        );
    }
}
