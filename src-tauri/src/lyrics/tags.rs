/// Write plain lyrics back to the audio file's embedded tags.
pub fn write_lyrics_to_file(file_path: &str, lyrics: &str) -> Result<(), String> {
    let path = std::path::Path::new(file_path);
    if !path.exists() {
        return Err("File not found".to_string());
    }

    let is_mp3 = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("mp3"))
        .unwrap_or(false);

    if is_mp3 {
        write_lyrics_id3(path, lyrics)
    } else {
        write_lyrics_lofty(path, lyrics)
    }
}

fn write_lyrics_id3(path: &std::path::Path, lyrics: &str) -> Result<(), String> {
    use id3::TagLike;
    let mut tag = id3::Tag::read_from_path(path).unwrap_or_else(|_| id3::Tag::new());

    // Remove existing USLT frames
    tag.remove("USLT");

    // Only add new frame if lyrics are non-empty
    if !lyrics.is_empty() {
        tag.add_frame(id3::frame::Lyrics {
            lang: "eng".to_string(),
            description: String::new(),
            text: lyrics.to_string(),
        });
    }

    tag.write_to_path(path, id3::Version::Id3v24)
        .map_err(|e| format!("Failed to write lyrics: {}", e))?;

    Ok(())
}

fn write_lyrics_lofty(path: &std::path::Path, lyrics: &str) -> Result<(), String> {
    use lofty::config::WriteOptions;
    use lofty::prelude::TagExt;
    use lofty::prelude::TaggedFileExt;
    use lofty::probe::Probe;
    use lofty::tag::ItemKey;

    let mut tagged = Probe::open(path)
        .map_err(|e| format!("Open failed: {}", e))?
        .read()
        .map_err(|e| format!("Read failed: {}", e))?;

    let tag = if let Some(t) = tagged.primary_tag_mut() {
        t
    } else {
        let tag_type = tagged.primary_tag_type();
        tagged.insert_tag(lofty::tag::Tag::new(tag_type));
        tagged.primary_tag_mut().ok_or("Failed to create tag")?
    };

    if lyrics.is_empty() {
        tag.remove_key(&ItemKey::Lyrics);
    } else {
        tag.insert_text(ItemKey::Lyrics, lyrics.to_string());
    }

    tag.save_to_path(path, WriteOptions::default())
        .map_err(|e| format!("Save failed: {}", e))?;

    Ok(())
}
