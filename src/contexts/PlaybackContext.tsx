import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { LibraryTrack } from "../types/library";

// ── Types ───────────────────────────────────────────────────────

type RepeatMode = "off" | "all" | "one";

interface PlaybackState {
  currentTrack: LibraryTrack | null;
  isPlaying: boolean;
  volume: number;
  queue: LibraryTrack[];
  queueIndex: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

interface PlaybackTimeState {
  currentTime: number;
  duration: number;
}

interface PlaybackContextValue {
  state: PlaybackState;
  playTrack: (track: LibraryTrack, contextTracks?: LibraryTrack[]) => void;
  playAlbum: (tracks: LibraryTrack[], startIndex?: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
  seekTo: (fraction: number) => void;
  setVolume: (volume: number) => void;
  addToQueue: (tracks: LibraryTrack[]) => void;
  playNext: (tracks: LibraryTrack[]) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
}

// ── Initial state ───────────────────────────────────────────────

const VOLUME_KEY = "crate-playback-volume";

const loadVolume = (): number => {
  const stored = localStorage.getItem(VOLUME_KEY);
  if (stored !== null) {
    const v = parseFloat(stored);
    if (isFinite(v) && v >= 0 && v <= 1) return v;
  }
  return 0.8;
};

const initial: PlaybackState = {
  currentTrack: null,
  isPlaying: false,
  volume: loadVolume(),
  queue: [],
  queueIndex: -1,
  shuffle: false,
  repeat: "off",
};

const initialTime: PlaybackTimeState = { currentTime: 0, duration: 0 };

// ── Shuffle helpers ─────────────────────────────────────────────

const shuffleIndices = (length: number, currentIndex: number): number[] => {
  const indices = Array.from({ length }, (_, i) => i).filter((i) => i !== currentIndex);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return [currentIndex, ...indices];
};

// ── Contexts ────────────────────────────────────────────────────

const PlaybackContext = createContext<PlaybackContextValue | null>(null);
const PlaybackTimeContext = createContext<PlaybackTimeState>(initialTime);

export const PlaybackProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<PlaybackState>(initial);
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

  // Dedupe guard: prevent double-incrementing the same track (e.g. from StrictMode double-mount)
  const lastCountedRef = useRef<{ id: number; at: number }>({ id: -1, at: 0 });

  // ── Set initial volume on the Rust engine ────────────────────
  useEffect(() => {
    invoke("audio_set_volume", { volume: state.volume }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Listen for Rust audio engine events ──────────────────────

  useEffect(() => {
    let active = true;
    const unlisteners: Array<() => void> = [];

    const register = (promise: Promise<() => void>) => {
      promise.then((unlisten) => {
        if (active) unlisteners.push(unlisten);
        else unlisten();
      });
    };

    register(
      listen<{ position: number; duration: number }>("audio:position", (event) => {
        if (!active) return;
        const { position, duration } = event.payload;
        lastPositionRef.current = position;
        lastPositionTimeRef.current = performance.now();
        setTime((prev) => {
          const newDur = duration > 0 ? duration : prev.duration;
          return { currentTime: position, duration: newDur };
        });
      }),
    );

    register(
      listen<number>("audio:duration-ready", (event) => {
        if (!active) return;
        const dur = event.payload;
        if (dur > 0) {
          setTime((prev) => ({ ...prev, duration: dur }));
        }
      }),
    );

    register(
      listen("audio:track-ended", () => {
        if (active) onTrackEndedRef.current();
      }),
    );

    register(
      listen("audio:gapless-transition", () => {
        if (active) onGaplessTransitionRef.current();
      }),
    );

    register(
      listen<string>("audio:error", (event) => {
        if (active) console.warn("Audio error:", event.payload);
      }),
    );

    return () => {
      active = false;
      unlisteners.forEach((fn) => fn());
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── rAF loop for smooth position interpolation ───────────────

  useEffect(() => {
    if (!state.isPlaying) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const tick = () => {
      const elapsed = (performance.now() - lastPositionTimeRef.current) / 1000;
      const interpolated = lastPositionRef.current + elapsed;
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

  // ── Play a track via the native audio engine ─────────────────

  const playFile = useCallback((track: LibraryTrack) => {
    setState((prev) => ({
      ...prev,
      currentTrack: track,
      isPlaying: true,
    }));
    setTime({ currentTime: 0, duration: track.duration_secs });
    lastPositionRef.current = 0;
    lastPositionTimeRef.current = performance.now();

    invoke("audio_play", { path: track.file_path, seekSecs: null }).catch(() => {});
  }, []);

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
    if (s.currentTrack) recordPlay(s.currentTrack.id);

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
      invoke("audio_play", { path: nextTrack.file_path, seekSecs: null }).catch(() => {});
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

    invoke("audio_play", { path: nextTrack.file_path, seekSecs: null }).catch(() => {});
  }, [getNextIndex, recordPlay, advanceShuffle]);

  // ── Gapless transition handler (engine already playing next track) ──

  const handleGaplessTransition = useCallback(() => {
    const s = stateRef.current;
    if (s.currentTrack) recordPlay(s.currentTrack.id);

    const nextIdx = getNextIndex();
    if (nextIdx === null) return;

    const nextTrack = s.queue[nextIdx];
    if (!nextTrack) return;

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
    // Don't invoke audio_play — the engine already transitioned seamlessly

    // Re-preload for continuous seamless looping (preload effect won't re-fire
    // since queueIndex didn't change)
    if (s.repeat === "one") {
      invoke("audio_preload_next", { path: nextTrack.file_path }).catch(() => {});
    }
  }, [getNextIndex, recordPlay, advanceShuffle]);

  // Keep refs in sync so event listeners always call the latest handler
  onTrackEndedRef.current = handleTrackEnded;
  onGaplessTransitionRef.current = handleGaplessTransition;

  // ── Preload next track for gapless playback ──────────────────

  useEffect(() => {
    if (!state.isPlaying || state.queue.length === 0) return;

    if (state.repeat === "one") {
      // Preload same track for seamless repeat (also replaces any stale preload)
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
    invoke("audio_pause").catch(() => {});
    setState((prev) => ({ ...prev, isPlaying: false }));
  }, []);

  const resume = useCallback(() => {
    invoke("audio_resume").catch(() => {});
    // Reset interpolation reference to current position
    lastPositionRef.current = timeRef.current.currentTime;
    lastPositionTimeRef.current = performance.now();
    setState((prev) => ({ ...prev, isPlaying: true }));
  }, []);

  const stop = useCallback(() => {
    invoke("audio_stop").catch(() => {});
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
      invoke("audio_seek", { positionSecs: 0 }).catch(() => {});
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

  const seekTo = useCallback((fraction: number) => {
    const dur = timeRef.current.duration;
    if (dur <= 0) return;
    const t = Math.min(fraction * dur, dur);
    // Show requested position immediately for responsiveness
    lastPositionRef.current = t;
    lastPositionTimeRef.current = performance.now();
    setTime((prev) => ({ ...prev, currentTime: t }));
    invoke("audio_seek", { positionSecs: t }).catch(() => {});
  }, []);

  const setVolume = useCallback((volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume));
    invoke("audio_set_volume", { volume: clamped }).catch(() => {});
    localStorage.setItem(VOLUME_KEY, String(clamped));
    setState((prev) => ({ ...prev, volume: clamped }));
  }, []);

  const addToQueue = useCallback((tracks: LibraryTrack[]) => {
    setState((prev) => ({
      ...prev,
      queue: [...prev.queue, ...tracks],
    }));
  }, []);

  const playNext = useCallback((tracks: LibraryTrack[]) => {
    setState((prev) => {
      const insertAt = prev.queueIndex + 1;
      const newQueue = [...prev.queue];
      newQueue.splice(insertAt, 0, ...tracks);
      return { ...prev, queue: newQueue };
    });
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    setState((prev) => {
      const newQueue = prev.queue.filter((_, i) => i !== index);
      let newIndex = prev.queueIndex;
      if (index < prev.queueIndex) newIndex -= 1;
      else if (index === prev.queueIndex) newIndex = -1;
      return { ...prev, queue: newQueue, queueIndex: newIndex };
    });
  }, []);

  const reorderQueue = useCallback((fromIndex: number, toIndex: number) => {
    setState((prev) => {
      const newQueue = [...prev.queue];
      const [moved] = newQueue.splice(fromIndex, 1);
      newQueue.splice(toIndex, 0, moved);

      let newIndex = prev.queueIndex;
      if (fromIndex === prev.queueIndex) {
        newIndex = toIndex;
      } else {
        if (fromIndex < prev.queueIndex && toIndex >= prev.queueIndex) newIndex -= 1;
        if (fromIndex > prev.queueIndex && toIndex <= prev.queueIndex) newIndex += 1;
      }

      return { ...prev, queue: newQueue, queueIndex: newIndex };
    });
  }, []);

  const clearQueue = useCallback(() => {
    setState((prev) => ({
      ...prev,
      queue: prev.currentTrack ? [prev.currentTrack] : [],
      queueIndex: prev.currentTrack ? 0 : -1,
    }));
  }, []);

  const toggleShuffle = useCallback(() => {
    setState((prev) => {
      const newShuffle = !prev.shuffle;
      if (newShuffle && prev.queue.length > 0) {
        shuffleOrderRef.current = shuffleIndices(prev.queue.length, prev.queueIndex);
        shufflePositionRef.current = 0;
      }
      return { ...prev, shuffle: newShuffle };
    });
  }, []);

  const cycleRepeat = useCallback(() => {
    setState((prev) => {
      const modes: RepeatMode[] = ["off", "all", "one"];
      const nextIdx = (modes.indexOf(prev.repeat) + 1) % modes.length;
      return { ...prev, repeat: modes[nextIdx] };
    });
  }, []);

  // Memoize the main context value so time-only updates don't re-render consumers
  const playbackValue = useMemo<PlaybackContextValue>(
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
    ],
  );

  return (
    <PlaybackContext.Provider value={playbackValue}>
      <PlaybackTimeContext.Provider value={time}>{children}</PlaybackTimeContext.Provider>
    </PlaybackContext.Provider>
  );
};

export const usePlayback = (): PlaybackContextValue => {
  const ctx = useContext(PlaybackContext);
  if (!ctx) throw new Error("usePlayback must be used within PlaybackProvider");
  return ctx;
};

export const usePlaybackTime = (): PlaybackTimeState => {
  return useContext(PlaybackTimeContext);
};
