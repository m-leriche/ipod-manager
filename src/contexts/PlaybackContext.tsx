import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
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

  // Dual audio elements for near-gapless playback
  const audioARef = useRef<HTMLAudioElement | null>(null);
  const audioBRef = useRef<HTMLAudioElement | null>(null);
  const activeRef = useRef<"A" | "B">("A");
  const rafRef = useRef<number>(0);
  const shuffleOrderRef = useRef<number[]>([]);
  const shufflePositionRef = useRef<number>(0);

  // Refs that track latest state for use in audio callbacks
  const stateRef = useRef(state);
  stateRef.current = state;
  const timeRef = useRef(time);
  timeRef.current = time;

  // Ref for the track-ended handler so both audio elements can use it
  const onTrackEndedRef = useRef<() => void>(() => {});

  const getActiveAudio = useCallback((): HTMLAudioElement | null => {
    return activeRef.current === "A" ? audioARef.current : audioBRef.current;
  }, []);

  const getIdleAudio = useCallback((): HTMLAudioElement | null => {
    return activeRef.current === "A" ? audioBRef.current : audioARef.current;
  }, []);

  // Initialize audio elements
  useEffect(() => {
    audioARef.current = new Audio();
    audioBRef.current = new Audio();
    audioARef.current.volume = state.volume;
    audioBRef.current.volume = state.volume;

    return () => {
      audioARef.current?.pause();
      audioBRef.current?.pause();
      if (audioARef.current) audioARef.current.src = "";
      if (audioBRef.current) audioBRef.current.src = "";
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // rAF loop — syncs currentTime; extends duration if audio element reports longer
  useEffect(() => {
    if (!state.isPlaying) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const tick = () => {
      const audio = getActiveAudio();
      if (audio) {
        const audioDur = isFinite(audio.duration) ? audio.duration : 0;
        setTime((prev) => {
          // Extend duration if audio element or playback position exceeds it
          const newDur = Math.max(prev.duration, audioDur, audio.currentTime);
          if (prev.currentTime === audio.currentTime && prev.duration === newDur) return prev;
          return { currentTime: audio.currentTime, duration: newDur };
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [state.isPlaying, getActiveAudio]);

  // Get the next queue index considering shuffle/repeat
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

  // Preload the next track on the idle audio element
  const preloadNext = useCallback(() => {
    const nextIdx = getNextIndex();
    if (nextIdx === null) return;

    const s = stateRef.current;
    const nextTrack = s.queue[nextIdx];
    if (!nextTrack) return;

    const idle = getIdleAudio();
    if (idle) {
      idle.src = convertFileSrc(nextTrack.file_path);
      idle.load();
    }
  }, [getNextIndex, getIdleAudio]);

  // Get accurate duration via ffprobe and update time state
  const probeDuration = useCallback((filePath: string) => {
    invoke<number>("get_accurate_duration", { path: filePath })
      .then((dur) => {
        // Only apply if still playing the same track
        if (dur > 0 && stateRef.current.currentTrack?.file_path === filePath) {
          setTime((prev) => ({ ...prev, duration: Math.max(prev.duration, dur) }));
        }
      })
      .catch(() => {}); // Fallback to metadata/audio.duration if ffprobe unavailable
  }, []);

  // Play a specific file path on the active audio element
  const playFile = useCallback(
    (track: LibraryTrack) => {
      const audio = getActiveAudio();
      if (!audio) return;

      // Set handlers BEFORE loading so we never miss loadedmetadata
      audio.onloadedmetadata = () => {
        const audioDur = isFinite(audio.duration) ? audio.duration : 0;
        setTime((prev) => ({ ...prev, duration: Math.max(prev.duration, audioDur) }));
        preloadNext();
      };
      audio.onended = () => onTrackEndedRef.current();

      setState((prev) => ({
        ...prev,
        currentTrack: track,
        isPlaying: true,
      }));
      setTime({ currentTime: 0, duration: track.duration_secs });

      audio.src = convertFileSrc(track.file_path);
      audio.play().catch(() => {});

      // Probe real duration in background — updates display when ready
      probeDuration(track.file_path);
    },
    [getActiveAudio, preloadNext, probeDuration],
  );

  // Track-ended handler — uses refs so it always has latest state.
  // Defined as a useCallback and kept in sync via onTrackEndedRef.
  const handleTrackEnded = useCallback(() => {
    const nextIdx = getNextIndex();
    if (nextIdx === null) {
      setState((prev) => ({ ...prev, isPlaying: false }));
      setTime((prev) => ({ ...prev, currentTime: 0 }));
      return;
    }

    const s = stateRef.current;
    const nextTrack = s.queue[nextIdx];
    if (!nextTrack) return;

    if (s.repeat === "one") {
      const audio = getActiveAudio();
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
      return;
    }

    // Try gapless swap to preloaded idle audio
    const idle = getIdleAudio();
    if (idle && idle.src) {
      activeRef.current = activeRef.current === "A" ? "B" : "A";

      // Set handlers on new active audio before playing
      idle.onended = () => onTrackEndedRef.current();
      idle.onloadedmetadata = () => {
        const audioDur = isFinite(idle.duration) ? idle.duration : 0;
        setTime((prev) => ({ ...prev, duration: Math.max(prev.duration, audioDur) }));
        preloadNext();
      };

      idle.play().catch(() => {});

      if (s.shuffle) {
        shufflePositionRef.current += 1;
      }

      setState((prev) => ({
        ...prev,
        currentTrack: nextTrack,
        queueIndex: nextIdx,
      }));

      setTime({ currentTime: 0, duration: nextTrack.duration_secs });
      probeDuration(nextTrack.file_path);
    } else {
      // Fallback: no preloaded audio, play normally
      if (s.shuffle) {
        shufflePositionRef.current += 1;
      }
      setState((prev) => ({ ...prev, queueIndex: nextIdx }));
      playFile(nextTrack);
    }
  }, [getNextIndex, getActiveAudio, getIdleAudio, preloadNext, playFile, probeDuration]);

  // Keep the ref in sync so audio onended always calls latest handler
  onTrackEndedRef.current = handleTrackEnded;

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
    getActiveAudio()?.pause();
    setState((prev) => ({ ...prev, isPlaying: false }));
  }, [getActiveAudio]);

  const resume = useCallback(() => {
    getActiveAudio()
      ?.play()
      .catch(() => {});
    setState((prev) => ({ ...prev, isPlaying: true }));
  }, [getActiveAudio]);

  const stop = useCallback(() => {
    const audio = getActiveAudio();
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setState((prev) => ({
      ...prev,
      isPlaying: false,
      currentTrack: null,
    }));
    setTime({ currentTime: 0, duration: 0 });
  }, [getActiveAudio]);

  const next = useCallback(() => {
    const nextIdx = getNextIndex();
    if (nextIdx === null) return;

    const s = stateRef.current;
    const nextTrack = s.queue[nextIdx];
    if (!nextTrack) return;

    if (s.shuffle) {
      shufflePositionRef.current += 1;
    }

    setState((prev) => ({ ...prev, queueIndex: nextIdx }));
    playFile(nextTrack);
  }, [getNextIndex, playFile]);

  const previous = useCallback(() => {
    const audio = getActiveAudio();
    // If more than 3 seconds in, restart current track
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
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
  }, [getActiveAudio, playFile]);

  const seekTo = useCallback(
    (fraction: number) => {
      const audio = getActiveAudio();
      if (!audio) return;
      const dur = timeRef.current.duration;
      if (dur <= 0) return;
      const t = Math.min(fraction * dur, dur);
      audio.currentTime = t;
      // Show requested position immediately for responsiveness
      setTime((prev) => ({ ...prev, currentTime: t }));
      // Correct to the actual position once the browser finishes seeking
      audio.addEventListener(
        "seeked",
        () => setTime((prev) => ({ ...prev, currentTime: audio.currentTime })),
        { once: true },
      );
    },
    [getActiveAudio],
  );

  const setVolume = useCallback((volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume));
    if (audioARef.current) audioARef.current.volume = clamped;
    if (audioBRef.current) audioBRef.current.volume = clamped;
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
