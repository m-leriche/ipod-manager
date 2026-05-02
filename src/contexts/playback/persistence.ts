import type { LibraryTrack } from "../../types/library";
import type { PlaybackState, RepeatMode } from "./types";

const VOLUME_KEY = "crate-playback-volume";
const PLAYBACK_STATE_KEY = "crate-playback-state";

export const loadVolume = (): number => {
  const stored = localStorage.getItem(VOLUME_KEY);
  if (stored !== null) {
    const v = parseFloat(stored);
    if (isFinite(v) && v >= 0 && v <= 1) return v;
  }
  return 0.8;
};

export const saveVolume = (volume: number) => {
  localStorage.setItem(VOLUME_KEY, String(volume));
};

export interface PersistedPlaybackState {
  queue: LibraryTrack[];
  queueIndex: number;
  currentTrack: LibraryTrack | null;
  shuffle: boolean;
  repeat: RepeatMode;
  position: number;
}

export const savePlaybackState = (state: PlaybackState, position: number) => {
  if (!state.currentTrack || state.queue.length === 0) {
    localStorage.removeItem(PLAYBACK_STATE_KEY);
    return;
  }
  const persisted: PersistedPlaybackState = {
    queue: state.queue,
    queueIndex: state.queueIndex,
    currentTrack: state.currentTrack,
    shuffle: state.shuffle,
    repeat: state.repeat,
    position,
  };
  try {
    localStorage.setItem(PLAYBACK_STATE_KEY, JSON.stringify(persisted));
  } catch {
    // localStorage full — silently skip
  }
};

export const loadPlaybackState = (): PersistedPlaybackState | null => {
  try {
    const stored = localStorage.getItem(PLAYBACK_STATE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as PersistedPlaybackState;
    if (!parsed.currentTrack || !Array.isArray(parsed.queue) || parsed.queue.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
};
