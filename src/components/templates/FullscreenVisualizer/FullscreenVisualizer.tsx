import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { usePlayback, usePlaybackTime } from "../../../contexts/PlaybackContext";
import { AlbumArtwork } from "../../atoms/AlbumArtwork/AlbumArtwork";
import { RadialSpectrum } from "../../atoms/RadialSpectrum/RadialSpectrum";
import type { FullscreenVisualizerProps } from "./types";

export const FullscreenVisualizer = ({ onClose }: FullscreenVisualizerProps) => {
  const { state } = usePlayback();
  const flashRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Raw amplitude flash — direct DOM write, no React re-render, tests pure latency
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<number>("audio:amplitude", (event) => {
      if (flashRef.current) {
        flashRef.current.style.opacity = String(event.payload * 0.25);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  const { currentTime, duration } = usePlaybackTime();
  const track = state.currentTrack;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center select-none">
      {/* Amplitude flash — raw latency test (white flash on beats) */}
      <div ref={flashRef} className="absolute inset-0 bg-white pointer-events-none" style={{ opacity: 0 }} />

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors z-10"
        title="Close visualizer (Esc)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Visualizer + album art */}
      <RadialSpectrum size={280} className="mb-8">
        <AlbumArtwork folderPath={track?.folder_path ?? null} size="xl" className="!rounded-2xl" />
      </RadialSpectrum>

      {/* Track info */}
      {track && (
        <div className="text-center px-8 max-w-lg">
          <div className="text-lg font-semibold text-white truncate">{track.title || track.file_name}</div>
          <div className="text-sm text-white/50 mt-1 truncate">{track.artist || "Unknown Artist"}</div>
          {track.album && <div className="text-sm text-white/30 mt-0.5 truncate">{track.album}</div>}
        </div>
      )}

      {/* Progress bar */}
      {duration > 0 && (
        <div className="absolute bottom-8 left-8 right-8 flex items-center gap-3">
          <span className="text-[11px] text-white/30 tabular-nums w-10 text-right">{formatTime(currentTime)}</span>
          <div className="flex-1 h-0.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-[width] duration-200"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            />
          </div>
          <span className="text-[11px] text-white/30 tabular-nums w-10">{formatTime(duration)}</span>
        </div>
      )}

      {/* Empty state */}
      {!track && <div className="text-white/20 text-sm">Play a track to see the visualizer</div>}
    </div>
  );
};

const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};
