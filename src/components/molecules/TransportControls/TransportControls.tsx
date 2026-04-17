import { useState, useCallback } from "react";
import { PlaybackButton } from "../../atoms/PlaybackButton/PlaybackButton";
import { SeekBar } from "../../atoms/SeekBar/SeekBar";

interface TransportControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (fraction: number) => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
}

const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export const TransportControls = ({
  isPlaying,
  currentTime,
  duration,
  shuffle,
  repeat,
  onPlayPause,
  onNext,
  onPrevious,
  onSeek,
  onToggleShuffle,
  onCycleRepeat,
}: TransportControlsProps) => {
  const [scrubFraction, setScrubFraction] = useState<number | null>(null);

  const handleScrub = useCallback((fraction: number | null) => {
    setScrubFraction(fraction);
  }, []);

  const fraction = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const displayTime = scrubFraction !== null ? scrubFraction * duration : Math.min(currentTime, duration || Infinity);

  return (
    <div className="flex flex-col items-center gap-1 w-full max-w-[600px]">
      <div className="flex items-center gap-2">
        {/* Shuffle */}
        <PlaybackButton onClick={onToggleShuffle} size="sm" title="Shuffle">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className={`w-3.5 h-3.5 ${shuffle ? "text-accent" : ""}`}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
          </svg>
        </PlaybackButton>

        {/* Previous */}
        <PlaybackButton onClick={onPrevious} size="sm" title="Previous">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </PlaybackButton>

        {/* Play / Pause */}
        <PlaybackButton onClick={onPlayPause} variant="primary" size="md" title={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 ml-0.5">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </PlaybackButton>

        {/* Next */}
        <PlaybackButton onClick={onNext} size="sm" title="Next">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
        </PlaybackButton>

        {/* Repeat */}
        <PlaybackButton onClick={onCycleRepeat} size="sm" title={`Repeat: ${repeat}`}>
          <div className="relative">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className={`w-3.5 h-3.5 ${repeat !== "off" ? "text-accent" : ""}`}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3"
              />
            </svg>
            {repeat === "one" && <span className="absolute -top-0.5 -right-1 text-[7px] font-bold text-accent">1</span>}
          </div>
        </PlaybackButton>
      </div>

      <div className="flex items-center gap-2 w-full">
        <span className="text-[10px] text-text-tertiary tabular-nums w-8 text-right">{formatTime(displayTime)}</span>
        <SeekBar value={fraction} onChange={onSeek} onScrub={handleScrub} className="flex-1" />
        <span className="text-[10px] text-text-tertiary tabular-nums w-8">{formatTime(duration)}</span>
      </div>
    </div>
  );
};
