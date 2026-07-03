export interface WaveformSeekBarProps {
  filePath: string | null;
  value: number;
  onChange: (value: number) => void;
  onScrub?: (fraction: number | null) => void;
  className?: string;
}
