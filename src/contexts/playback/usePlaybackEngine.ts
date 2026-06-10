import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { LibraryTrack } from "../../types/library";
import type { PlaybackState, PlaybackTimeState, PlaybackContextValue } from "./types";
import { savePlaybackState, loadPlaybackState } from "./persistence";
import { getSetting } from "../../utils/settings";
import { shuffleIndices, initialState, initialTime, computeReplayGain } from "./helpers";
import { useQueueOperations } from "./useQueueOperations";
import { usePlaybackSettings } from "./usePlaybackSettings";
import { useEngineEvents } from "./useEngineEvents";

// ── Hook ────────────────────────────────────────────────────────

export const usePlaybackEngine = (): { value: PlaybackContextValue; time: PlaybackTimeState } => {
  const [state, setState] = useState<PlaybackState>(initialState);
  const [time, setTime] = useState<PlaybackTimeState>(initialTime);

  const rafRef = useRef<number>(0);
  const shuffleOrderRef = useRef<number[]>([]);
  const shufflePositionRef = useRef<number>(0);

  // Position interpolation: store last known position + wall-clock time
  const lastPositionRef = useRef(0);
  const lastPositionTimeRef = useRef(0);

  // Refs that track latest state for use in callbacks
  const stateRef = useRef(state);
  stateRef.current = state;
  const timeRef = useRef(time);
  timeRef.current = time;

  // Refs for event handlers (so listeners always call the latest version)
  const onTrackEndedRef = useRef<() => void>(() => {});
  const onGaplessTransitionRef = useRef<() => void>(() => {});
  const getNextIndexRef = useRef<() => number | null>(() => null);
  const onMediaToggleRef = useRef<() => void>(() => {});
  const onMediaPlayRef = useRef<() => void>(() => {});
  const onMediaPauseRef = useRef<() => void>(() => {});
  const onMediaNextRef = useRef<() => void>(() => {});
  const onMediaPreviousRef = useRef<() => void>(() => {});

  // Gate for media key events: only respond after user explicitly starts playback.
  // Prevents macOS system events (phone calls, FaceTime) from triggering playback.
  const engineActiveRef = useRef(false);

  // Dedupe guard: prevent double-incrementing the same track (e.g. from StrictMode double-mount)
  const lastCountedRef = useRef<{ id: number; at: number }>({ id: -1, at: 0 });

  // Unix timestamp (seconds) of when the current track started playing — used for scrobble submission
  const trackStartedAtRef = useRef<number>(0);

  // Restored position for resume-from-where-you-left-off
  const restoredPositionRef = useRef(0);

  // Whether the queue has been restored from SQLite (prevents saving empty state on mount)
  const queueRestoredRef = useRef(false);

  // ── Set initial volume, crossfade, and speed on the Rust engine ─
  useEffect(() => {
    invoke("audio_set_volume", { volume: state.volume }).catch(() => {});
    invoke("audio_set_crossfade", { durationSecs: state.crossfade }).catch(() => {});
    if (state.speed !== 1.0) {
      invoke("audio_set_speed", { speed: state.speed }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Restore queue from SQLite on mount ──────────────────────
  useEffect(() => {
    if (!getSetting("resumeQueueOnLaunch")) {
      queueRestoredRef.current = true;
      return;
    }
    loadPlaybackState().then((restored) => {
      queueRestoredRef.current = true;
      if (!restored) return;
      restoredPositionRef.current = restored.position;
      setState((prev) => ({
        ...prev,
        queue: restored.queue,
        queueIndex: restored.queueIndex,
        currentTrack: restored.currentTrack,
        shuffle: restored.shuffle,
        repeat: restored.repeat,
      }));
      setTime({
        currentTime: restored.position,
        duration: restored.currentTrack?.duration_secs ?? 0,
      });
    });
  }, []);

  // ── Persist playback state to SQLite (debounced) ─────────────
  useEffect(() => {
    if (!queueRestoredRef.current) return;
    const timer = setTimeout(() => {
      savePlaybackState(stateRef.current, timeRef.current.currentTime);
    }, 500);
    return () => clearTimeout(timer);
  }, [state.currentTrack, state.queue, state.queueIndex, state.shuffle, state.repeat]);

  // Also persist position periodically while playing
  useEffect(() => {
    if (!state.isPlaying || !queueRestoredRef.current) return;
    const interval = setInterval(() => {
      savePlaybackState(stateRef.current, timeRef.current.currentTime);
    }, 5000);
    return () => clearInterval(interval);
  }, [state.isPlaying]);

  // ── Check library availability on mount + window focus ──────
  const checkLibraryAvailable = useCallback(() => {
    invoke<boolean>("check_library_available")
      .then((available) => {
        setState((prev) => (prev.libraryAvailable === available ? prev : { ...prev, libraryAvailable: available }));
      })
      .catch((e) => console.warn("Failed to check library availability:", e));
  }, []);

  useEffect(() => {
    checkLibraryAvailable();
    const onFocus = () => checkLibraryAvailable();
    window.addEventListener("focus", onFocus);

    let unlisten: (() => void) | undefined;
    listen<{ library_available: boolean }>("volume-changed", (event) => {
      setState((prev) =>
        prev.libraryAvailable === event.payload.library_available
          ? prev
          : { ...prev, libraryAvailable: event.payload.library_available },
      );
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      window.removeEventListener("focus", onFocus);
      unlisten?.();
    };
  }, [checkLibraryAvailable]);

  // Tracks the queue index for which a time-based preload was issued.
  const timePreloadedForRef = useRef(-1);

  // ── Listen for Rust audio engine events ──────────────────────
  useEngineEvents(
    {
      lastPositionRef,
      lastPositionTimeRef,
      stateRef,
      timePreloadedForRef,
      getNextIndexRef,
      onTrackEndedRef,
      onGaplessTransitionRef,
      onMediaToggleRef,
      onMediaPlayRef,
      onMediaPauseRef,
      onMediaNextRef,
      onMediaPreviousRef,
      rafRef,
    },
    setTime,
    setState,
  );

  // ── rAF loop for smooth position interpolation ───────────────

  useEffect(() => {
    if (!state.isPlaying) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const tick = () => {
      const elapsed = (performance.now() - lastPositionTimeRef.current) / 1000;
      const interpolated = lastPositionRef.current + elapsed * stateRef.current.speed;
      setTime((prev) => {
        if (Math.abs(prev.currentTime - interpolated) < 0.01) return prev;
        return { ...prev, currentTime: interpolated };
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [state.isPlaying]);

  // ── Get the next queue index considering shuffle/repeat ──────

  const getNextIndex = useCallback((): number | null => {
    const s = stateRef.current;
    if (s.queue.length === 0) return null;

    if (s.repeat === "one") return s.queueIndex;

    if (s.shuffle) {
      const nextPos = shufflePositionRef.current + 1;
      if (nextPos < shuffleOrderRef.current.length) {
        return shuffleOrderRef.current[nextPos];
      }
      return s.repeat === "all" ? shuffleOrderRef.current[0] : null;
    }

    const nextIdx = s.queueIndex + 1;
    if (nextIdx < s.queue.length) return nextIdx;
    return s.repeat === "all" ? 0 : null;
  }, []);

  // Advance shuffle position, re-shuffling when the cycle wraps around
  const advanceShuffle = useCallback((nextQueueIndex: number) => {
    const nextPos = shufflePositionRef.current + 1;
    if (nextPos >= shuffleOrderRef.current.length) {
      shuffleOrderRef.current = shuffleIndices(stateRef.current.queue.length, nextQueueIndex);
      shufflePositionRef.current = 0;
    } else {
      shufflePositionRef.current = nextPos;
    }
  }, []);

  // ── ReplayGain helper ────────────────────────────────────────

  const sendReplayGain = useCallback((track: LibraryTrack | null) => {
    const s = stateRef.current;
    const gain = computeReplayGain(track, s.replayGainEnabled, s.replayGainMode);
    invoke("audio_set_replay_gain", { gain }).catch(() => {});
  }, []);

  // ── Play a track via the native audio engine ─────────────────

  const playFile = useCallback(
    (track: LibraryTrack) => {
      engineActiveRef.current = true;
      if (!stateRef.current.libraryAvailable) {
        setState((prev) => ({
          ...prev,
          currentTrack: track,
          isPlaying: false,
          playbackError: "Library offline \u2014 connect your drive to play music",
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        currentTrack: track,
        isPlaying: true,
        playbackError: null,
      }));
      setTime({ currentTime: 0, duration: track.duration_secs });
      lastPositionRef.current = 0;
      lastPositionTimeRef.current = performance.now();

      trackStartedAtRef.current = Math.floor(Date.now() / 1000);
      window.dispatchEvent(new CustomEvent("track-started", { detail: track }));

      sendReplayGain(track);
      invoke("audio_play", { path: track.file_path, seekSecs: null }).catch((e) =>
        console.warn("audio_play failed:", e),
      );
    },
    [sendReplayGain],
  );

  // ── Track-ended handler ──────────────────────────────────────

  const recordPlay = useCallback((trackId: number) => {
    const now = Date.now();
    const last = lastCountedRef.current;
    if (last.id === trackId && now - last.at < 3000) return;
    lastCountedRef.current = { id: trackId, at: now };
    invoke("increment_play_count", { trackId }).then(() => {
      window.dispatchEvent(new CustomEvent("play-count-updated", { detail: { trackId } }));
    });
  }, []);

  const handleTrackEnded = useCallback(() => {
    const s = stateRef.current;
    if (s.currentTrack) {
      recordPlay(s.currentTrack.id);
      // Dispatch scrobble if track meets Last.fm eligibility (>30s, played >50% or >4min)
      const t = timeRef.current;
      if (
        s.currentTrack.duration_secs > 30 &&
        (t.currentTime >= s.currentTrack.duration_secs * 0.5 || t.currentTime >= 240)
      ) {
        window.dispatchEvent(
          new CustomEvent("track-scrobble", {
            detail: { track: s.currentTrack, startedAt: trackStartedAtRef.current },
          }),
        );
      }
    }

    const nextIdx = getNextIndex();
    if (nextIdx === null) {
      setState((prev) => ({ ...prev, isPlaying: false }));
      setTime((prev) => ({ ...prev, currentTime: 0 }));
      return;
    }

    const nextTrack = s.queue[nextIdx];
    if (!nextTrack) return;

    if (s.repeat === "one") {
      // Re-play from scratch — decoder is gone after EOF so seek+resume won't work
      lastPositionRef.current = 0;
      lastPositionTimeRef.current = performance.now();
      setTime({ currentTime: 0, duration: nextTrack.duration_secs });
      sendReplayGain(nextTrack);
      invoke("audio_play", { path: nextTrack.file_path, seekSecs: null }).catch((e) =>
        console.warn("audio_play failed:", e),
      );
      return;
    }

    if (s.shuffle) {
      advanceShuffle(nextIdx);
    }

    setState((prev) => ({
      ...prev,
      currentTrack: nextTrack,
      queueIndex: nextIdx,
    }));

    setTime({ currentTime: 0, duration: nextTrack.duration_secs });
    lastPositionRef.current = 0;
    lastPositionTimeRef.current = performance.now();
    trackStartedAtRef.current = Math.floor(Date.now() / 1000);
    window.dispatchEvent(new CustomEvent("track-started", { detail: nextTrack }));

    sendReplayGain(nextTrack);
    invoke("audio_play", { path: nextTrack.file_path, seekSecs: null }).catch((e) =>
      console.warn("audio_play failed:", e),
    );
  }, [getNextIndex, recordPlay, advanceShuffle, sendReplayGain]);

  // ── Gapless transition handler (engine already playing next track) ──

  // Compute the next queue index relative to a given index (for look-ahead preloading)
  const getNextIndexFrom = useCallback((fromIdx: number): number | null => {
    const s = stateRef.current;
    if (s.queue.length === 0) return null;

    if (s.repeat === "one") return fromIdx;

    if (s.shuffle) {
      const nextPos = shufflePositionRef.current + 1;
      if (nextPos < shuffleOrderRef.current.length) {
        return shuffleOrderRef.current[nextPos];
      }
      return s.repeat === "all" ? shuffleOrderRef.current[0] : null;
    }

    const nextIdx = fromIdx + 1;
    if (nextIdx < s.queue.length) return nextIdx;
    return s.repeat === "all" ? 0 : null;
  }, []);

  const handleGaplessTransition = useCallback(() => {
    const s = stateRef.current;
    if (s.currentTrack) {
      recordPlay(s.currentTrack.id);
      const t = timeRef.current;
      if (
        s.currentTrack.duration_secs > 30 &&
        (t.currentTime >= s.currentTrack.duration_secs * 0.5 || t.currentTime >= 240)
      ) {
        window.dispatchEvent(
          new CustomEvent("track-scrobble", {
            detail: { track: s.currentTrack, startedAt: trackStartedAtRef.current },
          }),
        );
      }
    }

    const nextIdx = getNextIndex();
    if (nextIdx === null) return;

    const nextTrack = s.queue[nextIdx];
    if (!nextTrack) return;

    // Compute look-ahead BEFORE advanceShuffle mutates the position ref
    const nextNextIdx = getNextIndexFrom(nextIdx);

    if (s.shuffle) {
      advanceShuffle(nextIdx);
    }

    setState((prev) => ({
      ...prev,
      currentTrack: nextTrack,
      queueIndex: nextIdx,
    }));

    setTime({ currentTime: 0, duration: nextTrack.duration_secs });
    lastPositionRef.current = 0;
    lastPositionTimeRef.current = performance.now();
    trackStartedAtRef.current = Math.floor(Date.now() / 1000);
    window.dispatchEvent(new CustomEvent("track-started", { detail: nextTrack }));
    sendReplayGain(nextTrack);
    // Don't invoke audio_play — the engine already transitioned seamlessly

    // Immediately preload the next-next track so continuous gapless
    // playback doesn't depend on the React effect cycle latency.
    if (nextNextIdx !== null && s.queue[nextNextIdx]) {
      invoke("audio_preload_next", { path: s.queue[nextNextIdx].file_path }).catch(() => {});
    }
  }, [getNextIndex, getNextIndexFrom, recordPlay, advanceShuffle, sendReplayGain]);

  // Keep refs in sync so event listeners always call the latest handler
  onTrackEndedRef.current = handleTrackEnded;
  onGaplessTransitionRef.current = handleGaplessTransition;
  getNextIndexRef.current = getNextIndex;

  // ── Preload next track for gapless playback ──────────────────

  // Immediate preload: fire whenever queue position or settings change
  useEffect(() => {
    if (!state.isPlaying || state.queue.length === 0) return;

    if (state.repeat === "one") {
      const currentTrack = state.queue[state.queueIndex];
      if (currentTrack) {
        invoke("audio_preload_next", { path: currentTrack.file_path }).catch(() => {});
      }
      return;
    }

    const nextIdx = getNextIndex();
    if (nextIdx !== null && state.queue[nextIdx]) {
      invoke("audio_preload_next", { path: state.queue[nextIdx].file_path }).catch(() => {});
    }
  }, [state.queueIndex, state.queue, state.shuffle, state.repeat, state.isPlaying, getNextIndex]);

  // ── Update macOS Now Playing metadata when track changes ─────

  useEffect(() => {
    if (state.currentTrack) {
      invoke("media_set_metadata", {
        title: state.currentTrack.title ?? state.currentTrack.file_name,
        artist: state.currentTrack.artist ?? null,
        album: state.currentTrack.album ?? null,
        durationSecs: state.currentTrack.duration_secs ?? null,
      }).catch(() => {});
    }
  }, [state.currentTrack]);

  // ── Update macOS Now Playing playback state ──────────────────

  useEffect(() => {
    invoke("media_set_playback", { isPlaying: state.isPlaying }).catch(() => {});
  }, [state.isPlaying]);

  // ── Public API ────────────────────────────────────────────────

  const playTrack = useCallback(
    (track: LibraryTrack, contextTracks?: LibraryTrack[]) => {
      const tracks = contextTracks ?? [track];
      const index = contextTracks ? tracks.findIndex((t) => t.id === track.id) : 0;

      setState((prev) => ({
        ...prev,
        queue: tracks,
        queueIndex: index >= 0 ? index : 0,
      }));

      if (state.shuffle) {
        shuffleOrderRef.current = shuffleIndices(tracks.length, index >= 0 ? index : 0);
        shufflePositionRef.current = 0;
      }

      playFile(track);
    },
    [playFile, state.shuffle],
  );

  const playAlbum = useCallback(
    (tracks: LibraryTrack[], startIndex = 0) => {
      if (tracks.length === 0) return;
      playTrack(tracks[startIndex], tracks);
    },
    [playTrack],
  );

  const pause = useCallback(() => {
    invoke("audio_pause").catch((e) => console.warn("audio_pause failed:", e));
    setState((prev) => ({ ...prev, isPlaying: false }));
  }, []);

  const resume = useCallback(() => {
    engineActiveRef.current = true;
    const s = stateRef.current;
    // Cold resume: track is restored from localStorage but audio engine hasn't loaded it
    if (s.currentTrack && !s.isPlaying && timeRef.current.duration === 0) {
      const seekPos = restoredPositionRef.current > 0 ? restoredPositionRef.current : null;
      setState((prev) => ({ ...prev, isPlaying: true, playbackError: null }));
      setTime({ currentTime: seekPos ?? 0, duration: s.currentTrack.duration_secs });
      lastPositionRef.current = seekPos ?? 0;
      lastPositionTimeRef.current = performance.now();
      sendReplayGain(s.currentTrack);
      invoke("audio_play", { path: s.currentTrack.file_path, seekSecs: seekPos }).catch((e) =>
        console.warn("audio_play failed:", e),
      );
      restoredPositionRef.current = 0;
      return;
    }
    invoke("audio_resume").catch((e) => console.warn("audio_resume failed:", e));
    // Reset interpolation reference to current position
    lastPositionRef.current = timeRef.current.currentTime;
    lastPositionTimeRef.current = performance.now();
    setState((prev) => ({ ...prev, isPlaying: true }));
  }, [sendReplayGain]);

  const stop = useCallback(() => {
    engineActiveRef.current = false;
    invoke("audio_stop").catch((e) => console.warn("audio_stop failed:", e));
    setState((prev) => ({
      ...prev,
      isPlaying: false,
      currentTrack: null,
    }));
    setTime({ currentTime: 0, duration: 0 });
  }, []);

  const next = useCallback(() => {
    const nextIdx = getNextIndex();
    if (nextIdx === null) return;

    const s = stateRef.current;
    const nextTrack = s.queue[nextIdx];
    if (!nextTrack) return;

    if (s.shuffle) {
      advanceShuffle(nextIdx);
    }

    setState((prev) => ({ ...prev, queueIndex: nextIdx }));
    playFile(nextTrack);
  }, [getNextIndex, playFile, advanceShuffle]);

  const previous = useCallback(() => {
    // If more than 3 seconds in, restart current track
    if (timeRef.current.currentTime > 3) {
      invoke("audio_seek", { positionSecs: 0 }).catch((e) => console.warn("audio_seek failed:", e));
      lastPositionRef.current = 0;
      lastPositionTimeRef.current = performance.now();
      setTime((prev) => ({ ...prev, currentTime: 0 }));
      return;
    }

    const s = stateRef.current;
    if (s.shuffle && shufflePositionRef.current > 0) {
      shufflePositionRef.current -= 1;
      const prevIdx = shuffleOrderRef.current[shufflePositionRef.current];
      const prevTrack = s.queue[prevIdx];
      if (prevTrack) {
        setState((prev) => ({ ...prev, queueIndex: prevIdx }));
        playFile(prevTrack);
      }
      return;
    }

    const prevIdx = s.queueIndex - 1;
    if (prevIdx >= 0) {
      const prevTrack = s.queue[prevIdx];
      if (prevTrack) {
        setState((prev) => ({ ...prev, queueIndex: prevIdx }));
        playFile(prevTrack);
      }
    }
  }, [playFile]);

  // Keep media key refs in sync (must be after next/previous are defined).
  // All handlers are gated on engineActiveRef to prevent macOS system events
  // (phone calls, FaceTime) from triggering playback. The gate is set when
  // the user explicitly plays or resumes a track.
  onMediaToggleRef.current = () => {
    const s = stateRef.current;
    if (!s.currentTrack || !engineActiveRef.current) return;
    if (s.isPlaying) {
      invoke("audio_pause").catch((e) => console.warn("audio_pause failed:", e));
      setState((prev) => ({ ...prev, isPlaying: false }));
    } else {
      invoke("audio_resume").catch((e) => console.warn("audio_resume failed:", e));
      lastPositionRef.current = timeRef.current.currentTime;
      lastPositionTimeRef.current = performance.now();
      setState((prev) => ({ ...prev, isPlaying: true }));
    }
  };
  onMediaPlayRef.current = () => {
    const s = stateRef.current;
    if (!s.currentTrack || !engineActiveRef.current || s.isPlaying) return;
    invoke("audio_resume").catch((e) => console.warn("audio_resume failed:", e));
    lastPositionRef.current = timeRef.current.currentTime;
    lastPositionTimeRef.current = performance.now();
    setState((prev) => ({ ...prev, isPlaying: true }));
  };
  onMediaPauseRef.current = () => {
    const s = stateRef.current;
    if (!s.currentTrack || !s.isPlaying) return;
    invoke("audio_pause").catch((e) => console.warn("audio_pause failed:", e));
    setState((prev) => ({ ...prev, isPlaying: false }));
  };
  onMediaNextRef.current = () => {
    if (engineActiveRef.current) next();
  };
  onMediaPreviousRef.current = () => {
    if (engineActiveRef.current) previous();
  };

  const seekTo = useCallback((fraction: number) => {
    const dur = timeRef.current.duration;
    if (dur <= 0) return;
    const t = Math.min(fraction * dur, dur);
    // Show requested position immediately for responsiveness
    lastPositionRef.current = t;
    lastPositionTimeRef.current = performance.now();
    setTime((prev) => ({ ...prev, currentTime: t }));
    invoke("audio_seek", { positionSecs: t }).catch((e) => console.warn("audio_seek failed:", e));
  }, []);

  // ── Extracted hooks ───────────────────────────────────────────

  const { addToQueue, playNext, removeFromQueue, reorderQueue, clearQueue, toggleShuffle, cycleRepeat } =
    useQueueOperations(setState, shuffleOrderRef, shufflePositionRef);

  const { setVolume, setSpeed, setCrossfade, setReplayGain, clearPlaybackError } = usePlaybackSettings(
    setState,
    stateRef,
  );

  // Memoize the main context value so time-only updates don't re-render consumers
  const value = useMemo<PlaybackContextValue>(
    () => ({
      state,
      playTrack,
      playAlbum,
      pause,
      resume,
      stop,
      next,
      previous,
      seekTo,
      setVolume,
      addToQueue,
      playNext,
      removeFromQueue,
      reorderQueue,
      clearQueue,
      toggleShuffle,
      cycleRepeat,
      setSpeed,
      setCrossfade,
      setReplayGain,
      clearPlaybackError,
    }),
    [
      state,
      playTrack,
      playAlbum,
      pause,
      resume,
      stop,
      next,
      previous,
      seekTo,
      setVolume,
      addToQueue,
      playNext,
      removeFromQueue,
      reorderQueue,
      clearQueue,
      toggleShuffle,
      cycleRepeat,
      setSpeed,
      setCrossfade,
      setReplayGain,
      clearPlaybackError,
    ],
  );

  return { value, time };
};
