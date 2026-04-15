export interface WaveformCanvasProps {
  peaks: [number, number][];
  width: number;
  height: number;
  playbackFraction?: number;
  onClick?: (fraction: number) => void;
  accentColor?: string;
  baseColor?: string;
  className?: string;
}

export interface WaveformColors {
  played: string;
  unplayed: string;
  cursor: string;
}
