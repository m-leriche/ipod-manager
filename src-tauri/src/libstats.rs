use lofty::prelude::{Accessor, AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

const AUDIO_EXT: &[&str] = &[
    "mp3", "flac", "m4a", "ogg", "opus", "wav", "aiff", "wma", "aac",
];

// ── Types ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct LibraryStats {
    pub total_tracks: usize,
    pub total_size: u64,
    pub total_duration_secs: f64,
    pub average_bitrate_kbps: u32,
    pub artist_count: usize,
    pub album_count: usize,
    pub format_breakdown: Vec<FormatEntry>,
    pub genre_distribution: Vec<DistributionEntry>,
    pub sample_rate_distribution: Vec<DistributionEntry>,
    pub year_distribution: Vec<YearEntry>,
    pub oldest_year: Option<u32>,
    pub newest_year: Option<u32>,
    pub file_details: Vec<FileDetail>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FormatEntry {
    pub format: String,
    pub count: usize,
    pub size: u64,
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DistributionEntry {
    pub label: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct YearEntry {
    pub year: u32,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileDetail {
    pub relative_path: String,
    pub artist: String,
    pub album: String,
    pub title: String,
    pub genre: String,
    pub year: Option<u32>,
    pub sample_rate: Option<u32>,
    pub sample_rate_display: String,
    pub bitrate_kbps: Option<u32>,
    pub duration_secs: f64,
    pub size: u64,
    pub format: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LibStatsScanProgress {
    pub total: usize,
    pub completed: usize,
    pub current_file: String,
}

// ── Helpers ─────────────────────────────────────────────────────

fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXT.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn collect_audio_files(dir: &Path, files: &mut Vec<std::path::PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    let mut dirs = Vec::new();

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.starts_with('.'))
            .unwrap_or(false)
        {
            continue;
        }
        if path.is_dir() {
            dirs.push(path);
        } else if is_audio(&path) {
            files.push(path);
        }
    }

    dirs.sort();
    for d in dirs {
        collect_audio_files(&d, files);
    }
}

fn format_ext(path: &Path) -> String {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_uppercase())
        .unwrap_or_else(|| "UNKNOWN".to_string())
}

fn format_sample_rate(rate: u32) -> String {
    if rate % 1000 == 0 {
        format!("{} kHz", rate / 1000)
    } else {
        format!("{:.1} kHz", rate as f64 / 1000.0)
    }
}

// ── Scan ────────────────────────────────────────────────────────

pub fn scan_library_stats(
    path: &str,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
) -> Result<LibraryStats, String> {
    let root = Path::new(path);
    if !root.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let mut audio_files = Vec::new();
    collect_audio_files(root, &mut audio_files);

    let total = audio_files.len();
    if total == 0 {
        return Err("No audio files found".to_string());
    }

    let mut total_size: u64 = 0;
    let mut total_duration_secs: f64 = 0.0;
    let mut total_bitrate_kbps: u64 = 0;
    let mut bitrate_count: u64 = 0;

    let mut artists: HashSet<String> = HashSet::new();
    let mut albums: HashSet<String> = HashSet::new();
    let mut formats: HashMap<String, (usize, u64)> = HashMap::new(); // (count, size)
    let mut genres: HashMap<String, usize> = HashMap::new();
    let mut sample_rates: HashMap<u32, usize> = HashMap::new();
    let mut years: HashMap<u32, usize> = HashMap::new();
    let mut oldest_year: Option<u32> = None;
    let mut newest_year: Option<u32> = None;
    let mut file_details: Vec<FileDetail> = Vec::with_capacity(total);

    for (i, file_path) in audio_files.iter().enumerate() {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err("Cancelled".to_string());
        }

        let file_name = file_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let _ = app.emit(
            "libstats-scan-progress",
            LibStatsScanProgress {
                total,
                completed: i,
                current_file: file_name,
            },
        );

        // File size
        let file_size = fs::metadata(file_path).map(|m| m.len()).unwrap_or(0);
        total_size += file_size;

        // Format breakdown
        let ext = format_ext(file_path);
        let entry = formats.entry(ext.clone()).or_insert((0, 0));
        entry.0 += 1;
        entry.1 += file_size;

        // Read audio metadata with lofty
        let probe = match Probe::open(file_path) {
            Ok(p) => p,
            Err(_) => continue,
        };
        let tagged = match probe.read() {
            Ok(t) => t,
            Err(_) => continue,
        };

        // Properties (duration, bitrate, sample rate)
        let props = tagged.properties();
        let file_duration = props.duration().as_secs_f64();
        total_duration_secs += file_duration;

        let file_bitrate = props.audio_bitrate();
        if let Some(br) = file_bitrate {
            total_bitrate_kbps += br as u64;
            bitrate_count += 1;
        }

        let file_sample_rate = props.sample_rate();
        if let Some(sr) = file_sample_rate {
            *sample_rates.entry(sr).or_insert(0) += 1;
        }

        // Tags
        let mut file_artist = String::new();
        let mut file_album = String::new();
        let mut file_title = String::new();
        let mut file_genre = String::new();
        let mut file_year: Option<u32> = None;

        let tag = tagged.primary_tag().or_else(|| tagged.first_tag());
        if let Some(tag) = tag {
            if let Some(title) = tag.title() {
                file_title = title.to_string();
            }
            if let Some(artist) = tag.artist() {
                let a = artist.to_string();
                if !a.is_empty() {
                    artists.insert(a.clone());
                    file_artist = a;
                }
            }
            if let Some(album) = tag.album() {
                let a = album.to_string();
                if !a.is_empty() {
                    albums.insert(a.clone());
                    file_album = a;
                }
            }
            if let Some(genre) = tag.genre() {
                let g = genre.to_string();
                if !g.is_empty() {
                    *genres.entry(g.clone()).or_insert(0) += 1;
                    file_genre = g;
                }
            }
            if let Some(year) = tag.year() {
                if year > 0 {
                    *years.entry(year).or_insert(0) += 1;
                    oldest_year = Some(oldest_year.map_or(year, |o: u32| o.min(year)));
                    newest_year = Some(newest_year.map_or(year, |n: u32| n.max(year)));
                    file_year = Some(year);
                }
            }
        }

        let relative_path = file_path
            .strip_prefix(root)
            .unwrap_or(file_path)
            .to_string_lossy()
            .to_string();

        let sample_rate_display = file_sample_rate
            .map(|sr| format_sample_rate(sr))
            .unwrap_or_default();

        file_details.push(FileDetail {
            relative_path,
            artist: file_artist,
            album: file_album,
            title: file_title,
            genre: file_genre,
            year: file_year,
            sample_rate: file_sample_rate,
            sample_rate_display,
            bitrate_kbps: file_bitrate,
            duration_secs: file_duration,
            size: file_size,
            format: ext,
        });
    }

    // Build sorted distributions
    let total_f = total as f64;

    let mut format_breakdown: Vec<FormatEntry> = formats
        .into_iter()
        .map(|(format, (count, size))| FormatEntry {
            format,
            count,
            size,
            percentage: (count as f64 / total_f) * 100.0,
        })
        .collect();
    format_breakdown.sort_by(|a, b| b.count.cmp(&a.count));

    let mut genre_distribution: Vec<DistributionEntry> = genres
        .into_iter()
        .map(|(label, count)| DistributionEntry { label, count })
        .collect();
    genre_distribution.sort_by(|a, b| b.count.cmp(&a.count));

    let mut sample_rate_distribution: Vec<DistributionEntry> = sample_rates
        .into_iter()
        .map(|(rate, count)| DistributionEntry {
            label: format_sample_rate(rate),
            count,
        })
        .collect();
    sample_rate_distribution.sort_by(|a, b| b.count.cmp(&a.count));

    let mut year_distribution: Vec<YearEntry> = years
        .into_iter()
        .map(|(year, count)| YearEntry { year, count })
        .collect();
    year_distribution.sort_by_key(|e| e.year);

    let average_bitrate_kbps = if bitrate_count > 0 {
        (total_bitrate_kbps / bitrate_count) as u32
    } else {
        0
    };

    Ok(LibraryStats {
        total_tracks: total,
        total_size,
        total_duration_secs,
        average_bitrate_kbps,
        artist_count: artists.len(),
        album_count: albums.len(),
        format_breakdown,
        genre_distribution,
        sample_rate_distribution,
        year_distribution,
        oldest_year,
        newest_year,
        file_details,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_audio_recognizes_formats() {
        assert!(is_audio(Path::new("song.mp3")));
        assert!(is_audio(Path::new("song.FLAC")));
        assert!(is_audio(Path::new("song.m4a")));
        assert!(!is_audio(Path::new("cover.jpg")));
        assert!(!is_audio(Path::new("notes.txt")));
    }

    #[test]
    fn format_ext_normalizes() {
        assert_eq!(format_ext(Path::new("song.mp3")), "MP3");
        assert_eq!(format_ext(Path::new("song.FLAC")), "FLAC");
        assert_eq!(format_ext(Path::new("no_ext")), "UNKNOWN");
    }

    #[test]
    fn format_sample_rate_display() {
        assert_eq!(format_sample_rate(44100), "44.1 kHz");
        assert_eq!(format_sample_rate(48000), "48 kHz");
        assert_eq!(format_sample_rate(96000), "96 kHz");
    }
}
