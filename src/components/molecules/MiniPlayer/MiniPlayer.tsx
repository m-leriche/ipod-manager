import { WaveformCanvas } from "../../atoms/WaveformCanvas/WaveformCanvas";
import { formatPlaybackTime } from "./helpers";
import type { MiniPlayerProps } from "./types";

export const MiniPlayer = ({ audio, peaks, duration, onExpand }: MiniPlayerProps) => {
  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
      {/* Waveform */}
      <div className="px-2 pt-2">
        <WaveformCanvas
          peaks={peaks}
          width={336}
          height={64}
          playbackFraction={audio.playbackFraction}
          onClick={audio.seekTo}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={audio.isPlaying ? audio.pause : audio.play}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors text-xs"
          data-testid="play-pause-btn"
          aria-label={audio.isPlaying ? "Pause" : "Play"}
        >
          {audio.isPlaying ? "⏸" : "▶"}
        </button>
        <button
          onClick={audio.stop}
          className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-text-tertiary hover:text-text-secondary hover:border-border-active transition-colors text-xs"
          data-testid="stop-btn"
          aria-label="Stop"
        >
          ⏹
        </button>

        <span className="flex-1 text-[10px] text-text-tertiary tabular-nums text-center" data-testid="time-display">
          {formatPlaybackTime(audio.currentTime)} / {formatPlaybackTime(duration)}
        </span>

        {onExpand && (
          <button
            onClick={onExpand}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-text-tertiary hover:text-text-secondary hover:border-border-active transition-colors text-xs"
            aria-label="Expand waveform"
            data-testid="expand-btn"
          >
            ⤢
          </button>
        )}
      </div>
    </div>
  );
};
