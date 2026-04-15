export interface AudioPlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackFraction: number;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seekTo: (fraction: number) => void;
}

export interface MiniPlayerProps {
  audio: AudioPlaybackState;
  peaks: [number, number][];
  duration: number;
  onExpand?: () => void;
}
