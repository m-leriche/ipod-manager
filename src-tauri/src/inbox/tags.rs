use lofty::config::WriteOptions;
use lofty::prelude::{TagExt, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::ItemKey;
use std::path::Path;

/// Strip metadata we don't want carried into the library on import: the Sort
/// Artist, Album Artist, and Sort Album Artist tags are removed, and the
/// Compilation flag is forced to false. The plain Artist tag becomes the single
/// source of truth for organization. Best effort — a file lofty can't parse is
/// left untouched and the error surfaces to the caller.
pub(super) fn strip_import_tags(path: &Path) -> Result<(), String> {
    let mut tagged = Probe::open(path)
        .map_err(|e| format!("Open failed: {}", e))?
        .read()
        .map_err(|e| format!("Read failed: {}", e))?;

    // Two calls because the first mutable borrow can't be reused in the else arm.
    let tag = if tagged.primary_tag_mut().is_some() {
        tagged.primary_tag_mut()
    } else {
        tagged.first_tag_mut()
    };
    let Some(tag) = tag else {
        return Ok(()); // no tags to strip
    };

    tag.remove_key(&ItemKey::TrackArtistSortOrder);
    tag.remove_key(&ItemKey::AlbumArtist);
    tag.remove_key(&ItemKey::AlbumArtistSortOrder);
    tag.insert_text(ItemKey::FlagCompilation, "0".to_string());

    tag.save_to_path(path, WriteOptions::default())
        .map_err(|e| format!("Save failed: {}", e))
}
