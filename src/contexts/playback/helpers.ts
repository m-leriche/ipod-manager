import type { LibraryTrack } from "../../types/library";
import type { PlaybackState, PlaybackTimeState, ReplayGainMode } from "./types";
import { loadVolume, loadCrossfade, loadSpeed, loadReplayGainEnabled, loadReplayGainMode } from "./persistence";

// ── Shuffle helpers ─────────────────────────────────────────────

export const shuffleIndices = (length: number, currentIndex: number): number[] => {
  const indices = Array.from({ length }, (_, i) => i).filter((i) => i !== currentIndex);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return [currentIndex, ...indices];
};

// ── Initial state ───────────────────────────────────────────────

export const initialState: PlaybackState = {
  currentTrack: null,
  isPlaying: false,
  volume: loadVolume(),
  speed: loadSpeed(),
  crossfade: loadCrossfade(),
  replayGainEnabled: loadReplayGainEnabled(),
  replayGainMode: loadReplayGainMode() as ReplayGainMode,
  queue: [],
  queueIndex: -1,
  shuffle: false,
  repeat: "off",
  libraryAvailable: true,
  playbackError: null,
};

// ── ReplayGain helpers ──────────────────────────────────────────

/** Convert a ReplayGain dB value to a linear amplitude multiplier. */
export const dbToLinear = (db: number): number => Math.pow(10, db / 20);

/** Compute the linear gain for a track based on current ReplayGain settings. */
export const computeReplayGain = (track: LibraryTrack | null, enabled: boolean, mode: ReplayGainMode): number => {
  if (!enabled || !track) return 1.0;
  const db = mode === "album" ? (track.replay_gain_album_db ?? track.replay_gain_track_db) : track.replay_gain_track_db;
  return db != null ? dbToLinear(db) : 1.0;
};

// ── Initial time state ──────────────────────────────────────────

export const initialTime: PlaybackTimeState = {
  currentTime: 0,
  duration: 0,
};
