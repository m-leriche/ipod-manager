import { SeekBar } from "../../atoms/SeekBar/SeekBar";
import { useWaveformPeaks } from "./useWaveformPeaks";
import type { WaveformSeekBarProps } from "./types";

export const WaveformSeekBar = ({ filePath, value, onChange, onScrub, className }: WaveformSeekBarProps) => {
  const peaks = useWaveformPeaks(filePath);

  return (
    <SeekBar value={value} onChange={onChange} onScrub={onScrub} peaks={peaks ?? undefined} className={className} />
  );
};
