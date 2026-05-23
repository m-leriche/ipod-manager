import { invoke } from "@tauri-apps/api/core";
import type { LibraryTrack } from "../../types/library";
import type { PlaybackState, RepeatMode } from "./types";
import { getSetting, setSetting } from "../../utils/settings";

export const loadVolume = (): number => getSetting("volume");
export const saveVolume = (volume: number) => setSetting("volume", volume);

export const loadCrossfade = (): number => getSetting("crossfade");
export const saveCrossfade = (seconds: number) => setSetting("crossfade", seconds);

export const loadSpeed = (): number => getSetting("speed");
export const saveSpeed = (speed: number) => setSetting("speed", speed);

export const loadReplayGainEnabled = (): boolean => getSetting("replayGainEnabled");
export const saveReplayGainEnabled = (enabled: boolean) => setSetting("replayGainEnabled", enabled);

export const loadReplayGainMode = (): string => getSetting("replayGainMode");
export const saveReplayGainMode = (mode: string) => setSetting("replayGainMode", mode);

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
    invoke("clear_playback_queue").catch((e) => console.warn("Failed to clear queue:", e));
    return;
  }
  const trackIds = state.queue.map((t) => t.id);
  invoke("save_playback_queue", {
    trackIds,
    queueIndex: state.queueIndex,
    shuffle: state.shuffle,
    repeat: state.repeat,
    position,
  }).catch((e) => console.warn("Failed to save queue:", e));
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
