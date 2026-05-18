import { invoke } from "@tauri-apps/api/core";
import type { LibraryTrack } from "../../types/library";
import type { PlaybackState, RepeatMode } from "./types";

const VOLUME_KEY = "crate-playback-volume";
const CROSSFADE_KEY = "crate-playback-crossfade";

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

export const loadCrossfade = (): number => {
  const stored = localStorage.getItem(CROSSFADE_KEY);
  if (stored !== null) {
    const v = parseFloat(stored);
    if (isFinite(v) && v >= 0 && v <= 12) return v;
  }
  return 0;
};

export const saveCrossfade = (seconds: number) => {
  localStorage.setItem(CROSSFADE_KEY, String(seconds));
};

export interface PersistedPlaybackState {
  queue: LibraryTrack[];
  queueIndex: number;
  currentTrack: LibraryTrack | null;
  shuffle: boolean;
  repeat: RepeatMode;
  position: number;
}

interface QueueState {
  tracks: LibraryTrack[];
  queue_index: number;
  shuffle: boolean;
  repeat: string;
  position: number;
}

export const savePlaybackState = (state: PlaybackState, position: number) => {
  if (!state.currentTrack || state.queue.length === 0) {
    invoke("clear_playback_queue").catch(() => {});
    return;
  }
  const trackIds = state.queue.map((t) => t.id);
  invoke("save_playback_queue", {
    trackIds,
    queueIndex: state.queueIndex,
    shuffle: state.shuffle,
    repeat: state.repeat,
    position,
  }).catch(() => {});
};

export const loadPlaybackState = async (): Promise<PersistedPlaybackState | null> => {
  try {
    const result = await invoke<QueueState | null>("load_playback_queue");
    if (!result || result.tracks.length === 0) return null;

    const queueIndex = Math.max(0, Math.min(result.queue_index, result.tracks.length - 1));
    return {
      queue: result.tracks,
      queueIndex,
      currentTrack: result.tracks[queueIndex] ?? null,
      shuffle: result.shuffle,
      repeat: (result.repeat as RepeatMode) || "off",
      position: result.position,
    };
  } catch {
    return null;
  }
};
