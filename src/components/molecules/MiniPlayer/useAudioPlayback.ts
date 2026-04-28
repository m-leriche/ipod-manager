import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AudioPlaybackState } from "./types";

export const useAudioPlayback = (filePath: string | null): AudioPlaybackState => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const rafRef = useRef<number>(0);
  const lastPositionRef = useRef(0);
  const lastPositionTimeRef = useRef(0);
  const activePathRef = useRef<string | null>(null);
  const ownsPlaybackRef = useRef(false);

  // Track file path changes — stop previous, start new
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    activePathRef.current = filePath;

    if (!filePath) {
      if (ownsPlaybackRef.current) {
        invoke("audio_stop").catch(() => {});
        ownsPlaybackRef.current = false;
      }
      return;
    }

    return () => {
      if (ownsPlaybackRef.current) {
        invoke("audio_stop").catch(() => {});
        ownsPlaybackRef.current = false;
      }
      cancelAnimationFrame(rafRef.current);
    };
  }, [filePath]);

  // Listen for position events from the Rust engine
  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    listen<{ position: number; duration: number }>("audio:position", (event) => {
      const { position, duration: dur } = event.payload;
      lastPositionRef.current = position;
      lastPositionTimeRef.current = performance.now();
      setCurrentTime(position);
      if (dur > 0) setDuration(dur);
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<number>("audio:duration-ready", (event) => {
      if (event.payload > 0) setDuration(event.payload);
    }).then((unlisten) => unlisteners.push(unlisten));

    listen("audio:track-ended", () => {
      setIsPlaying(false);
      setCurrentTime(0);
    }).then((unlisten) => unlisteners.push(unlisten));

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, []);

  // rAF interpolation for smooth time updates
  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const tick = () => {
      const elapsed = (performance.now() - lastPositionTimeRef.current) / 1000;
      setCurrentTime(lastPositionRef.current + elapsed);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]);

  const play = useCallback(() => {
    if (!activePathRef.current) return;
    ownsPlaybackRef.current = true;
    invoke("audio_play", { path: activePathRef.current, seekSecs: null }).catch(() => {});
    lastPositionRef.current = 0;
    lastPositionTimeRef.current = performance.now();
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    invoke("audio_pause").catch(() => {});
    setIsPlaying(false);
  }, []);

  const stop = useCallback(() => {
    invoke("audio_stop").catch(() => {});
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  const seekTo = useCallback(
    (fraction: number) => {
      const t = fraction * duration;
      if (isFinite(t)) {
        invoke("audio_seek", { positionSecs: t }).catch(() => {});
        lastPositionRef.current = t;
        lastPositionTimeRef.current = performance.now();
        setCurrentTime(t);
      }
    },
    [duration],
  );

  const playbackFraction = duration > 0 ? currentTime / duration : 0;

  return { isPlaying, currentTime, duration, playbackFraction, play, pause, stop, seekTo };
};
