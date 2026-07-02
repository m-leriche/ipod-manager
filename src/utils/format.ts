/**
 * Shared formatting helpers. Previously these were re-implemented (with subtly
 * different output and invalid-value handling) in ~18 components.
 */

/**
 * Clock-style duration: `M:SS`, promoting to `H:MM:SS` once it reaches an hour.
 * Returns `invalid` (default `"—"`) for non-finite or negative input — pass
 * `"0:00"` for player time displays.
 */
export const formatDuration = (secs: number, invalid = "—"): string => {
  if (!isFinite(secs) || secs < 0) return invalid;
  const total = Math.floor(secs);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
};

/**
 * Compact human-readable duration for aggregates: `1d 2h 3m` / `2h 3m` / `3m`.
 */
export const formatDurationLong = (secs: number): string => {
  const total = isFinite(secs) && secs > 0 ? Math.floor(secs) : 0;
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

/**
 * Binary (1024-based) byte size: `512 B` / `1.5 KB` / `2.00 GB` / `1.10 TB`.
 */
export const formatBytes = (bytes: number): string => {
  if (!isFinite(bytes) || bytes < 1024) return `${Math.max(0, Math.floor(bytes) || 0)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  return `${(bytes / 1024 ** 4).toFixed(2)} TB`;
};

/** "44100" → "44.1 kHz", "48000" → "48 kHz". */
export const formatSampleRate = (rate: number): string =>
  rate % 1000 === 0 ? `${rate / 1000} kHz` : `${(rate / 1000).toFixed(1)} kHz`;
