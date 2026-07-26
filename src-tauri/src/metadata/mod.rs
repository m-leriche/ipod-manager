mod flac_inplace;
mod read;
mod write;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackMetadata {
    pub file_path: String,
    pub file_name: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub sort_artist: Option<String>,
    pub sort_album_artist: Option<String>,
    pub track: Option<u32>,
    pub track_total: Option<u32>,
    pub disc_number: Option<u32>,
    pub disc_total: Option<u32>,
    pub year: Option<u32>,
    pub genre: Option<String>,
    pub compilation: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetadataUpdate {
    pub file_path: String,
    /// Library row this update targets, when known.
    ///
    /// Stamped onto undo operations so they survive the file being moved by the
    /// background reorganize after the save that produced them. Absent on
    /// updates built by the frontend, which always name a file that exists.
    #[serde(default)]
    pub track_id: Option<i64>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub sort_artist: Option<String>,
    pub sort_album_artist: Option<String>,
    pub track: Option<u32>,
    pub track_total: Option<u32>,
    pub disc_number: Option<u32>,
    pub disc_total: Option<u32>,
    pub year: Option<u32>,
    pub genre: Option<String>,
    pub compilation: Option<bool>,
}

/// ID3 tag version used when writing MP3 metadata.
///
/// v2.3 is the default: it has the widest player compatibility (including
/// Rockbox and classic iPods) and avoids the id3 crate's v2.4 behavior of
/// converting "/" to "\0" (the v2.4 multi-value separator), which corrupts
/// names like "dd/mm/yyyy".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Id3WriteVersion {
    #[default]
    V23,
    V24,
}

impl Id3WriteVersion {
    pub const SETTING_KEY: &'static str = "id3_write_version";

    pub fn from_setting(value: Option<&str>) -> Self {
        match value {
            Some("v2.4") => Id3WriteVersion::V24,
            _ => Id3WriteVersion::V23,
        }
    }

    pub fn as_setting(&self) -> &'static str {
        match self {
            Id3WriteVersion::V23 => "v2.3",
            Id3WriteVersion::V24 => "v2.4",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct MetadataScanProgress {
    pub total: usize,
    pub completed: usize,
    pub current_file: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct MetadataSaveProgress {
    pub total: usize,
    pub completed: usize,
    pub current_file: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct MetadataSaveResult {
    pub total: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub cancelled: bool,
    pub errors: Vec<String>,
    pub undo_operations: Vec<MetadataUpdate>,
}

pub(crate) use read::read_genre;
pub use read::{scan_metadata, scan_metadata_paths};
pub use write::save_metadata;

#[cfg(test)]
mod tests {
    use super::*;
    use read::empty_track;

    #[test]
    fn empty_track_has_no_metadata() {
        let t = empty_track("/a/b.mp3".to_string(), "b.mp3".to_string());
        assert_eq!(t.file_path, "/a/b.mp3");
        assert!(t.title.is_none());
        assert!(t.artist.is_none());
    }

    #[test]
    fn id3_version_defaults_to_v23() {
        assert_eq!(Id3WriteVersion::from_setting(None), Id3WriteVersion::V23);
        assert_eq!(
            Id3WriteVersion::from_setting(Some("garbage")),
            Id3WriteVersion::V23
        );
        assert_eq!(
            Id3WriteVersion::from_setting(Some("v2.3")),
            Id3WriteVersion::V23
        );
    }

    #[test]
    fn id3_version_parses_v24() {
        assert_eq!(
            Id3WriteVersion::from_setting(Some("v2.4")),
            Id3WriteVersion::V24
        );
    }

    #[test]
    fn id3_version_setting_roundtrip() {
        for v in [Id3WriteVersion::V23, Id3WriteVersion::V24] {
            assert_eq!(Id3WriteVersion::from_setting(Some(v.as_setting())), v);
        }
    }

    #[test]
    fn read_genre_joins_multiple_values() {
        use lofty::tag::{ItemValue, Tag, TagItem, TagType};

        let mut tag = Tag::new(TagType::VorbisComments);
        for g in ["Rock", " Grunge ", ""] {
            tag.push(TagItem::new(
                lofty::tag::ItemKey::Genre,
                ItemValue::Text(g.to_string()),
            ));
        }
        assert_eq!(read_genre(&tag).as_deref(), Some("Rock; Grunge"));

        let empty = Tag::new(TagType::VorbisComments);
        assert_eq!(read_genre(&empty), None);
    }
}
