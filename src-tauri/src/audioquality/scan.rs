use rayon::prelude::*;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

use super::cache::{self, FileStamp};
use super::probe::probe_audio_file;
use super::{AudioFileInfo, QualityScanProgress};
use crate::audio_utils::collect_audio_files;
use crate::library::SharedConn;

pub fn scan_audio_quality(
    path: &str,
    conn: &SharedConn,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
) -> Result<Vec<AudioFileInfo>, String> {
    let root = Path::new(path);
    if !root.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let mut audio_files = Vec::new();
    collect_audio_files(root, &mut audio_files);

    probe_files(&audio_files, conn, app, cancel_flag)
}

pub fn scan_audio_quality_paths(
    paths: &[String],
    conn: &SharedConn,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
) -> Result<Vec<AudioFileInfo>, String> {
    let audio_files: Vec<PathBuf> = paths
        .iter()
        .map(PathBuf::from)
        .filter(|p| p.exists())
        .collect();

    probe_files(&audio_files, conn, app, cancel_flag)
}

/// Dedicated pool for quality probes. Each file spawns ffprobe — plus two
/// full-file ffmpeg decode passes for lossless files — so keep it modest
/// rather than one worker per CPU thread.
fn probe_pool() -> &'static rayon::ThreadPool {
    static POOL: OnceLock<rayon::ThreadPool> = OnceLock::new();
    POOL.get_or_init(|| {
        let threads = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4)
            .clamp(2, 8);
        rayon::ThreadPoolBuilder::new()
            .num_threads(threads)
            .thread_name(|i| format!("quality-worker-{}", i))
            .build()
            .expect("static thread pool with fixed config")
    })
}

/// Probe files in parallel, reusing cached verdicts for files whose mtime and
/// size are unchanged. Results come back in input order; freshly probed
/// verdicts are upserted into the cache in one transaction at the end.
fn probe_files(
    audio_files: &[PathBuf],
    conn: &SharedConn,
    app: AppHandle,
    cancel_flag: Arc<AtomicBool>,
) -> Result<Vec<AudioFileInfo>, String> {
    let total = audio_files.len();
    let cached = cache::load_verdicts(conn)?;
    let progress = ProbeProgress::new(&app, total);

    // (input index, verdict, stamp to cache — None when reused from cache).
    let mut indexed: Vec<(usize, AudioFileInfo, Option<FileStamp>)> = probe_pool().install(|| {
        audio_files
            .par_iter()
            .enumerate()
            .filter_map(|(i, file_path)| {
                if cancel_flag.load(Ordering::SeqCst) {
                    return None;
                }
                let result = probe_or_reuse(file_path, &cached);
                progress.tick(file_path);
                result.map(|(info, fresh_stamp)| (i, info, fresh_stamp))
            })
            .collect()
    });

    if cancel_flag.load(Ordering::SeqCst) {
        return Err("Cancelled".to_string());
    }

    indexed.sort_by_key(|(i, _, _)| *i);

    let fresh: Vec<(AudioFileInfo, FileStamp)> = indexed
        .iter()
        .filter_map(|(_, info, stamp)| stamp.map(|s| (info.clone(), s)))
        .collect();
    cache::store_verdicts(conn, &fresh)?;

    Ok(indexed.into_iter().map(|(_, info, _)| info).collect())
}

/// Return the cached verdict when the file is unchanged, otherwise probe it.
/// The stamp is `Some` only for fresh probes that should be written back to
/// the cache. `None` means the file couldn't be probed — it is skipped.
fn probe_or_reuse(
    path: &Path,
    cached: &HashMap<String, (FileStamp, AudioFileInfo)>,
) -> Option<(AudioFileInfo, Option<FileStamp>)> {
    let stamp = cache::file_stamp(path);
    if let Some(s) = stamp {
        let path_str = path.to_string_lossy();
        if let Some(info) = cache::lookup(cached, &path_str, s) {
            return Some((info.clone(), None));
        }
    }
    let info = probe_audio_file(path).ok()?;
    Some((info, stamp))
}

/// Thread-safe per-file progress emitter. The counter is read under the emit
/// lock so `completed` never goes backwards when workers finish out of order.
struct ProbeProgress<'a> {
    app: &'a AppHandle,
    total: usize,
    completed: AtomicUsize,
    emit_lock: Mutex<()>,
}

impl<'a> ProbeProgress<'a> {
    fn new(app: &'a AppHandle, total: usize) -> Self {
        Self {
            app,
            total,
            completed: AtomicUsize::new(0),
            emit_lock: Mutex::new(()),
        }
    }

    fn tick(&self, file_path: &Path) {
        self.completed.fetch_add(1, Ordering::Relaxed);
        let Ok(_guard) = self.emit_lock.lock() else {
            return;
        };
        let completed = self.completed.load(Ordering::Relaxed);
        let file_name = file_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let _ = self.app.emit(
            "quality-scan-progress",
            QualityScanProgress {
                total: self.total,
                completed,
                current_file: file_name,
            },
        );
    }
}
