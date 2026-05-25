import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { PlaybackState, PlaybackTimeState } from "./types";

interface EngineEventRefs {
  lastPositionRef: React.MutableRefObject<number>;
  lastPositionTimeRef: React.MutableRefObject<number>;
  stateRef: React.MutableRefObject<PlaybackState>;
  timePreloadedForRef: React.MutableRefObject<number>;
  getNextIndexRef: React.MutableRefObject<() => number | null>;
  onTrackEndedRef: React.MutableRefObject<() => void>;
  onGaplessTransitionRef: React.MutableRefObject<() => void>;
  onMediaToggleRef: React.MutableRefObject<() => void>;
  onMediaPlayRef: React.MutableRefObject<() => void>;
  onMediaPauseRef: React.MutableRefObject<() => void>;
  onMediaNextRef: React.MutableRefObject<() => void>;
  onMediaPreviousRef: React.MutableRefObject<() => void>;
  rafRef: React.MutableRefObject<number>;
}

/**
 * Registers all Rust audio engine event listeners and system media key listeners.
 * Uses refs so the listeners always call the latest handler versions.
 */
export const useEngineEvents = (
  refs: EngineEventRefs,
  setTime: React.Dispatch<React.SetStateAction<PlaybackTimeState>>,
  setState: React.Dispatch<React.SetStateAction<PlaybackState>>,
) => {
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
        refs.lastPositionRef.current = position;
        refs.lastPositionTimeRef.current = performance.now();
        setTime((prev) => {
          const newDur = duration > 0 ? duration : prev.duration;
          return { currentTime: position, duration: newDur };
        });

        if (duration > 0) {
          const s = refs.stateRef.current;
          if (s.isPlaying && s.repeat !== "one" && refs.timePreloadedForRef.current !== s.queueIndex) {
            const threshold = Math.max(s.crossfade + 5, 10);
            const remaining = duration - position;
            if (remaining <= threshold && remaining > 0) {
              refs.timePreloadedForRef.current = s.queueIndex;
              const nextIdx = refs.getNextIndexRef.current();
              if (nextIdx !== null && s.queue[nextIdx]) {
                invoke("audio_preload_next", { path: s.queue[nextIdx].file_path }).catch(() => {});
              }
            }
          }
        }
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
        if (active) refs.onTrackEndedRef.current();
      }),
    );

    register(
      listen("audio:gapless-transition", () => {
        if (active) refs.onGaplessTransitionRef.current();
      }),
    );

    register(
      listen<string>("audio:error", (event) => {
        if (!active) return;
        console.warn("Audio error:", event.payload);
        const msg = event.payload.includes("Failed to open")
          ? "File not available \u2014 drive may be disconnected"
          : "Playback error";
        setState((prev) => ({ ...prev, isPlaying: false, playbackError: msg }));
      }),
    );

    register(
      listen("mediakey:toggle", () => {
        if (active) refs.onMediaToggleRef.current();
      }),
    );
    register(
      listen("mediakey:play", () => {
        if (active) refs.onMediaPlayRef.current();
      }),
    );
    register(
      listen("mediakey:pause", () => {
        if (active) refs.onMediaPauseRef.current();
      }),
    );
    register(
      listen("mediakey:next", () => {
        if (active) refs.onMediaNextRef.current();
      }),
    );
    register(
      listen("mediakey:previous", () => {
        if (active) refs.onMediaPreviousRef.current();
      }),
    );

    return () => {
      active = false;
      unlisteners.forEach((fn) => fn());
      cancelAnimationFrame(refs.rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
