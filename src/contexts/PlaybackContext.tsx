import { createContext, useContext } from "react";
import type { PlaybackContextValue, PlaybackTimeState } from "./playback/types";
import { usePlaybackEngine } from "./playback/usePlaybackEngine";

export type { PlaybackState, PlaybackTimeState, PlaybackContextValue, RepeatMode } from "./playback/types";

const PlaybackContext = createContext<PlaybackContextValue | null>(null);
const PlaybackTimeContext = createContext<PlaybackTimeState>({ currentTime: 0, duration: 0 });

export const PlaybackProvider = ({ children }: { children: React.ReactNode }) => {
  const { value, time } = usePlaybackEngine();

  return (
    <PlaybackContext.Provider value={value}>
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
