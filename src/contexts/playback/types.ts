import type { LibraryTrack } from "../../types/library";

export type RepeatMode = "off" | "all" | "one";

export interface PlaybackState {
  currentTrack: LibraryTrack | null;
  isPlaying: boolean;
  volume: number;
  queue: LibraryTrack[];
  queueIndex: number;
  shuffle: boolean;
  repeat: RepeatMode;
  libraryAvailable: boolean;
  playbackError: string | null;
}

export interface PlaybackTimeState {
  currentTime: number;
  duration: number;
}

export interface PlaybackContextValue {
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
  clearPlaybackError: () => void;
}
