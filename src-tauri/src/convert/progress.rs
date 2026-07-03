use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

use super::ConvertProgress;

const EMIT_INTERVAL: Duration = Duration::from_millis(100);

/// Aggregates per-file progress from parallel workers into batch-wide
/// `convert-progress` events (completed count + overall percent).
pub(super) struct BatchProgress {
    app: AppHandle,
    total: usize,
    completed: AtomicUsize,
    file_percents: Mutex<Vec<f64>>,
    last_emit: Mutex<Instant>,
}

impl BatchProgress {
    pub fn new(app: AppHandle, total: usize) -> Self {
        Self {
            app,
            total,
            completed: AtomicUsize::new(0),
            file_percents: Mutex::new(vec![0.0; total]),
            last_emit: Mutex::new(Instant::now() - EMIT_INTERVAL),
        }
    }

    /// Record one file's percent and emit a throttled batch-wide event.
    pub fn update(&self, file_index: usize, file_name: &str, percent: f64) {
        let overall = self.record(file_index, percent);
        if self.should_emit() {
            self.emit(file_name, overall);
        }
    }

    /// Mark a file as finished (converted or failed) and emit immediately so
    /// completions are never lost to throttling.
    pub fn finish_file(&self, file_index: usize, file_name: &str) {
        self.completed.fetch_add(1, Ordering::Relaxed);
        let overall = self.record(file_index, 100.0);
        self.emit(file_name, overall);
    }

    fn record(&self, file_index: usize, percent: f64) -> f64 {
        let Ok(mut percents) = self.file_percents.lock() else {
            return 0.0;
        };
        if let Some(slot) = percents.get_mut(file_index) {
            *slot = percent;
        }
        percents.iter().sum::<f64>() / self.total.max(1) as f64
    }

    fn should_emit(&self) -> bool {
        let now = Instant::now();
        let Ok(mut last) = self.last_emit.try_lock() else {
            return false;
        };
        if now.duration_since(*last) < EMIT_INTERVAL {
            return false;
        }
        *last = now;
        true
    }

    fn emit(&self, file_name: &str, overall: f64) {
        let _ = self.app.emit(
            "convert-progress",
            ConvertProgress {
                completed_files: self.completed.load(Ordering::Relaxed),
                total_files: self.total,
                current_file: file_name.to_string(),
                percent: overall,
                phase: "converting".to_string(),
            },
        );
    }
}
