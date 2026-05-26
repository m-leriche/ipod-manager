import { useCallback } from "react";
import type React from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PlaybackState, ReplayGainMode } from "./types";
import { saveVolume, saveSpeed, saveCrossfade, saveReplayGainEnabled, saveReplayGainMode } from "./persistence";
import { computeReplayGain } from "./helpers";

export const usePlaybackSettings = (
  setState: React.Dispatch<React.SetStateAction<PlaybackState>>,
  stateRef: React.MutableRefObject<PlaybackState>,
) => {
  const setVolume = useCallback(
    (volume: number) => {
      const clamped = Math.max(0, Math.min(1, volume));
      invoke("audio_set_volume", { volume: clamped }).catch((e) => console.warn("audio_set_volume failed:", e));
      saveVolume(clamped);
      setState((prev) => ({ ...prev, volume: clamped }));
    },
    [setState],
  );

  const setSpeed = useCallback(
    (speed: number) => {
      const clamped = Math.max(0.25, Math.min(4, speed));
      invoke("audio_set_speed", { speed: clamped }).catch((e) => console.warn("audio_set_speed failed:", e));
      saveSpeed(clamped);
      setState((prev) => ({ ...prev, speed: clamped }));
    },
    [setState],
  );

  const setCrossfade = useCallback(
    (seconds: number) => {
      const clamped = Math.max(0, Math.min(12, seconds));
      invoke("audio_set_crossfade", { durationSecs: clamped }).catch((e) =>
        console.warn("audio_set_crossfade failed:", e),
      );
      saveCrossfade(clamped);
      setState((prev) => ({ ...prev, crossfade: clamped }));
    },
    [setState],
  );

  const setReplayGain = useCallback(
    (enabled: boolean, mode?: ReplayGainMode) => {
      const newMode = mode ?? stateRef.current.replayGainMode;
      saveReplayGainEnabled(enabled);
      saveReplayGainMode(newMode);
      setState((prev) => ({ ...prev, replayGainEnabled: enabled, replayGainMode: newMode }));
      const gain = computeReplayGain(stateRef.current.currentTrack, enabled, newMode);
      invoke("audio_set_replay_gain", { gain }).catch(() => {});
    },
    [setState, stateRef],
  );

  const clearPlaybackError = useCallback(() => {
    setState((prev) => (prev.playbackError ? { ...prev, playbackError: null } : prev));
  }, [setState]);

  return { setVolume, setSpeed, setCrossfade, setReplayGain, clearPlaybackError };
};
