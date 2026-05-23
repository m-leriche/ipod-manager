use crate::ffprobe_meta;
use lofty::prelude::{Accessor, AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::ItemKey;
use rusqlite::{params, Connection};
use std::fs;
use std::path::Path;

use super::types::TrackData;

pub(crate) fn read_track_for_library(path: &Path) -> TrackData {
    let file_path = path.to_string_lossy().to_string();
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let folder_path = path
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let format = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_uppercase())
        .unwrap_or_default();
    let file_size = fs::metadata(path).map(|m| m.len()).unwrap_or(0);

    let tagged = Probe::open(path).ok().and_then(|p| p.read().ok());

    let (duration_secs, sample_rate, bitrate_kbps) = tagged
        .as_ref()
        .map(|t| {
            let props = t.properties();
            (
                props.duration().as_secs_f64(),
                props.sample_rate(),
                props.audio_bitrate(),
            )
        })
        .unwrap_or((0.0, None, None));

    let tag = tagged
        .as_ref()
        .and_then(|t| t.primary_tag().or_else(|| t.first_tag()));

    // If lofty couldn't parse the file at all, fall back to ffprobe
    if tagged.is_none() {
        if let Some(meta) = ffprobe_meta::read_metadata(path) {
            return TrackData {
                file_path,
                file_name,
                folder_path,
                title: meta.title,
                artist: meta.artist,
                album: meta.album,
                album_artist: meta.album_artist,
                sort_artist: meta.sort_artist,
                sort_album_artist: meta.sort_album_artist,
                track_number: meta.track,
                track_total: meta.track_total,
                disc_number: meta.disc,
                disc_total: meta.disc_total,
                year: meta.year,
                genre: meta.genre,
                duration_secs: meta.duration_secs,
                sample_rate: meta.sample_rate,
                bitrate_kbps: meta.bitrate_kbps,
                format,
                file_size,
                play_count: None,
                lyrics: None,
                replay_gain_track_db: None,
                replay_gain_album_db: None,
            };
        }
    }

    let trim_tag = |s: &str| {
        let trimmed = s.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    };

    let (
        title,
        artist,
        album,
        album_artist,
        sort_artist,
        sort_album_artist,
        track_number,
        track_total,
        disc_number,
        disc_total,
        year,
        genre,
        play_count,
        lyrics,
        replay_gain_track_db,
        replay_gain_album_db,
    ) = if let Some(tag) = tag {
        // Try reading play count from common tag fields:
        // - TXXX:FMPS_PLAYCOUNT (MediaMonkey, Clementine, etc.)
        // - Vorbis comment FMPS_PLAYCOUNT / PLAY_COUNTER
        // - ItemKey::Popularimeter (ID3v2 POPM frame)
        let pc = tag
            .get_string(&ItemKey::Unknown("FMPS_PLAYCOUNT".into()))
            .and_then(|s| s.trim().parse::<f64>().ok())
            .map(|v| v as u32)
            .or_else(|| {
                tag.get_string(&ItemKey::Popularimeter)
                    .and_then(|s| s.trim().parse::<u32>().ok())
            });

        let rg_track = tag
            .get_string(&ItemKey::ReplayGainTrackGain)
            .and_then(parse_replay_gain);
        let rg_album = tag
            .get_string(&ItemKey::ReplayGainAlbumGain)
            .and_then(parse_replay_gain);

        let embedded_lyrics = tag.get_string(&ItemKey::Lyrics).and_then(|s| {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        });

        (
            tag.title().and_then(|s| trim_tag(&s)),
            tag.artist().and_then(|s| trim_tag(&s)),
            tag.album().and_then(|s| trim_tag(&s)),
            tag.get_string(&ItemKey::AlbumArtist).and_then(trim_tag),
            tag.get_string(&ItemKey::TrackArtistSortOrder)
                .and_then(trim_tag),
            tag.get_string(&ItemKey::AlbumArtistSortOrder)
                .and_then(trim_tag),
            tag.track(),
            tag.track_total(),
            tag.disk(),
            tag.disk_total(),
            tag.year(),
            tag.genre().and_then(|s| trim_tag(&s)),
            pc,
            embedded_lyrics,
            rg_track,
            rg_album,
        )
    } else {
        (
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        )
    };

    TrackData {
        file_path,
        file_name,
        folder_path,
        title,
        artist,
        album,
        album_artist,
        sort_artist,
        sort_album_artist,
        track_number,
        track_total,
        disc_number,
        disc_total,
        year,
        genre,
        duration_secs,
        sample_rate,
        bitrate_kbps,
        format,
        file_size,
        play_count,
        lyrics,
        replay_gain_track_db,
        replay_gain_album_db,
    }
}

/// Parse a ReplayGain tag value like "-3.2 dB" or "+1.5 dB" into an f32.
fn parse_replay_gain(s: &str) -> Option<f32> {
    let s = s.trim();
    let s = s
        .strip_suffix("dB")
        .or_else(|| s.strip_suffix("db"))
        .unwrap_or(s);
    s.trim().parse::<f32>().ok()
}

pub(crate) fn upsert_track(
    conn: &Connection,
    t: &TrackData,
    mtime: i64,
    now: i64,
) -> Result<(), String> {
    let tag_play_count = t.play_count.unwrap_or(0) as i64;
    conn.execute(
        "INSERT INTO tracks (
            file_path, file_name, folder_path, title, artist, album, album_artist,
            sort_artist, sort_album_artist, track_number, track_total, disc_number,
            disc_total, year, genre, duration_secs, sample_rate, bitrate_kbps, format,
            file_size, modified_at, scanned_at, created_at, play_count, lyrics,
            replay_gain_track_db, replay_gain_album_db
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15,
            ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27
        )
        ON CONFLICT(file_path) DO UPDATE SET
            file_name=excluded.file_name, folder_path=excluded.folder_path,
            title=excluded.title, artist=excluded.artist, album=excluded.album,
            album_artist=excluded.album_artist, sort_artist=excluded.sort_artist,
            sort_album_artist=excluded.sort_album_artist, track_number=excluded.track_number,
            track_total=excluded.track_total, disc_number=excluded.disc_number,
            disc_total=excluded.disc_total, year=excluded.year, genre=excluded.genre,
            duration_secs=excluded.duration_secs, sample_rate=excluded.sample_rate,
            bitrate_kbps=excluded.bitrate_kbps, format=excluded.format,
            file_size=excluded.file_size, modified_at=excluded.modified_at,
            scanned_at=excluded.scanned_at,
            play_count=MAX(play_count, excluded.play_count),
            lyrics=COALESCE(excluded.lyrics, lyrics),
            replay_gain_track_db=excluded.replay_gain_track_db,
            replay_gain_album_db=excluded.replay_gain_album_db",
        params![
            t.file_path,
            t.file_name,
            t.folder_path,
            t.title,
            t.artist,
            t.album,
            t.album_artist,
            t.sort_artist,
            t.sort_album_artist,
            t.track_number,
            t.track_total,
            t.disc_number,
            t.disc_total,
            t.year,
            t.genre,
            t.duration_secs,
            t.sample_rate,
            t.bitrate_kbps,
            t.format,
            t.file_size as i64,
            mtime,
            now,
            now,
            tag_play_count,
            t.lyrics,
            t.replay_gain_track_db,
            t.replay_gain_album_db,
        ],
    )
    .map_err(|e| format!("Failed to upsert track: {}", e))?;

    Ok(())
}
