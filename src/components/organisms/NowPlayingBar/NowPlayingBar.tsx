import { useState, useEffect, useCallback, useRef } from "react";
import { usePlayback, usePlaybackTime } from "../../../contexts/PlaybackContext";
import { AlbumArtwork } from "../../atoms/AlbumArtwork/AlbumArtwork";
import { SeekBar } from "../../atoms/SeekBar/SeekBar";
import { NowPlayingInfo } from "../../molecules/NowPlayingInfo/NowPlayingInfo";
import { SpeedControl } from "../../molecules/SpeedControl/SpeedControl";
import { TransportControls } from "../../molecules/TransportControls/TransportControls";
import { VolumeControl } from "../../molecules/VolumeControl/VolumeControl";
import { LyricsPanel } from "../LyricsPanel/LyricsPanel";
import { getDragPayload } from "../TrackTable/TrackTable";
import { matchesShortcut } from "../../../utils/shortcuts";
import { useViewLayout } from "../../../contexts/ViewLayoutContext";
import type { LibraryTrack } from "../../../types/library";

interface NowPlayingBarProps {
  onToggleQueue?: () => void;
  queueOpen?: boolean;
  onToggleMiniPlayer?: () => void;
  miniPlayer?: boolean;
}

export const NowPlayingBar = ({ onToggleQueue, queueOpen, onToggleMiniPlayer, miniPlayer }: NowPlayingBarProps) => {
  const { showInfoPanel, showStatsPanel, toggleInfoPanel, toggleStatsPanel } = useViewLayout();
  const {
    state,
    pause,
    resume,
    next,
    previous,
    seekTo,
    setVolume,
    addToQueue,
    toggleShuffle,
    cycleRepeat,
    setSpeed,
    clearPlaybackError,
  } = usePlayback();
  const { currentTime, duration } = usePlaybackTime();
  const [dragOver, setDragOver] = useState(false);

  // Use a ref for time values in the keyboard handler to avoid re-registering 60x/sec
  const timeRef = useRef({ currentTime, duration });
  timeRef.current = { currentTime, duration };

  const handlePlayPause = useCallback(() => {
    if (state.isPlaying) pause();
    else resume();
  }, [state.isPlaying, pause, resume]);

  // Global keyboard shortcuts
  useEffect(() => {
    if (!state.currentTrack) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      const t = timeRef.current;
      if (matchesShortcut(e, "playPause")) {
        e.preventDefault();
        handlePlayPause();
      } else if (matchesShortcut(e, "previousTrack")) {
        e.preventDefault();
        previous();
      } else if (matchesShortcut(e, "nextTrack")) {
        e.preventDefault();
        next();
      } else if (matchesShortcut(e, "seekBackward")) {
        e.preventDefault();
        seekTo(Math.max(0, (t.currentTime - 10) / t.duration));
      } else if (matchesShortcut(e, "seekForward")) {
        e.preventDefault();
        seekTo(Math.min(1, (t.currentTime + 10) / t.duration));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.currentTrack, handlePlayPause, previous, next, seekTo]);

  // Auto-clear playback error after 5 seconds
  useEffect(() => {
    if (!state.playbackError) return;
    const timer = setTimeout(() => clearPlaybackError(), 5000);
    return () => clearTimeout(timer);
  }, [state.playbackError, clearPlaybackError]);

  if (!state.currentTrack) return null;

  if (miniPlayer) {
    const fraction = duration > 0 ? Math.min(1, currentTime / duration) : 0;
    return (
      <MiniPlayerView
        track={state.currentTrack}
        isPlaying={state.isPlaying}
        fraction={fraction}
        currentTime={currentTime}
        duration={duration}
        onPlayPause={handlePlayPause}
        onNext={next}
        onPrevious={previous}
        onSeek={seekTo}
        onExpand={onToggleMiniPlayer}
      />
    );
  }

  return (
    <div
      className={`h-[72px] border-t bg-bg-secondary px-6 flex items-center gap-4 shrink-0 transition-colors relative z-10 ${
        dragOver ? "border-t-accent border-t-2 bg-accent/5" : "border-border"
      }`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-crate-queue-drag")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const tracks = getDragPayload();
        if (tracks.length > 0) addToQueue(tracks);
      }}
    >
      {/* Left — Now Playing Info or error */}
      <div className="w-[240px] shrink-0" aria-live="polite">
        {state.playbackError ? (
          <div className="flex items-center gap-2" role="alert">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-red-400 shrink-0">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-[11px] text-red-400 font-medium leading-tight">{state.playbackError}</span>
          </div>
        ) : (
          <NowPlayingInfo track={state.currentTrack} />
        )}
      </div>

      {/* Center — Transport Controls */}
      <div className="flex-1 flex justify-center">
        <TransportControls
          isPlaying={state.isPlaying}
          currentTime={currentTime}
          duration={duration}
          shuffle={state.shuffle}
          repeat={state.repeat}
          onPlayPause={handlePlayPause}
          onNext={next}
          onPrevious={previous}
          onSeek={seekTo}
          onToggleShuffle={toggleShuffle}
          onCycleRepeat={cycleRepeat}
        />
      </div>

      {/* Right — Panel toggles + Volume + Queue toggle */}
      <div className="shrink-0 flex items-center justify-end gap-1">
        {!miniPlayer && (
          <PanelToggle active={showInfoPanel} onClick={toggleInfoPanel} title="Info panel">
            <circle cx="12" cy="12" r="9" />
            <path strokeLinecap="round" d="M12 11v5M12 8h.01" />
          </PanelToggle>
        )}
        {!miniPlayer && (
          <PanelToggle active={showStatsPanel} onClick={toggleStatsPanel} title="Library stats">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16l4-6 4 3 5-7" />
          </PanelToggle>
        )}
        {!miniPlayer && <div className="w-px h-4 bg-border mx-1" />}
        <SpeedControl speed={state.speed} onChange={setSpeed} />
        <VolumeControl volume={state.volume} onChange={setVolume} />
        {onToggleQueue && !miniPlayer && (
          <button
            onClick={onToggleQueue}
            className={`p-1.5 rounded transition-colors ${
              queueOpen ? "text-accent bg-accent/10" : "text-text-tertiary hover:text-text-secondary"
            }`}
            title="Queue"
            aria-label="Queue"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path strokeLinecap="round" d="M4 6h16M4 10h16M4 14h10" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 14v6m-3-3h6" />
            </svg>
          </button>
        )}
        {onToggleMiniPlayer && (
          <button
            onClick={onToggleMiniPlayer}
            className={`p-1.5 rounded transition-colors ${
              miniPlayer ? "text-accent bg-accent/10" : "text-text-tertiary hover:text-text-secondary"
            }`}
            title={miniPlayer ? "Exit mini player" : "Mini player"}
            aria-label={miniPlayer ? "Exit mini player" : "Mini player"}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
              {miniPlayer ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25"
                />
              )}
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const MiniPlayerView = ({
  track,
  isPlaying,
  fraction,
  currentTime,
  duration,
  onPlayPause,
  onNext,
  onPrevious,
  onSeek,
  onExpand,
}: {
  track: LibraryTrack;
  isPlaying: boolean;
  fraction: number;
  currentTime: number;
  duration: number;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (fraction: number) => void;
  onExpand?: () => void;
}) => {
  const [showLyrics, setShowLyrics] = useState(false);

  return (
    <div className="flex flex-col flex-1 h-full bg-bg-secondary select-none overflow-hidden">
      {/* Album art or lyrics — shrinks to fit, controls always visible */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {showLyrics ? (
          <div className="absolute inset-0 bg-bg-primary/95">
            <LyricsPanel track={track} variant="overlay" />
          </div>
        ) : (
          <AlbumArtwork folderPath={track.folder_path} size="full" className="!rounded-none !aspect-auto !h-full" />
        )}
        {/* Overlay buttons */}
        <div className="absolute top-2 right-2 flex gap-1">
          <button
            onClick={() => setShowLyrics((prev) => !prev)}
            className={`p-1.5 rounded-lg transition-colors ${
              showLyrics ? "bg-accent/80 text-white" : "bg-black/40 text-white/80 hover:text-white hover:bg-black/60"
            }`}
            title={showLyrics ? "Show album art" : "Show lyrics"}
            aria-label={showLyrics ? "Show album art" : "Show lyrics"}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V4.5l-10.5 3v7.553m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z"
              />
            </svg>
          </button>
          {onExpand && (
            <button
              onClick={onExpand}
              className="p-1.5 rounded-lg bg-black/40 text-white/80 hover:text-white hover:bg-black/60 transition-colors"
              title="Exit mini player"
              aria-label="Exit mini player"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Track info */}
      <div className="px-4 pt-3 pb-2 shrink-0">
        <div className="text-xs font-medium text-text-primary truncate text-center">
          {track.title || track.file_name}
        </div>
        <div className="text-[11px] text-text-secondary truncate text-center mt-0.5">
          {track.artist || "Unknown Artist"}
        </div>
      </div>

      {/* Seek bar */}
      <div className="px-4 flex items-center gap-2 shrink-0">
        <span className="text-[9px] text-text-tertiary tabular-nums w-6 text-right">{formatTime(currentTime)}</span>
        <SeekBar value={fraction} onChange={onSeek} className="flex-1" />
        <span className="text-[9px] text-text-tertiary tabular-nums w-6">{formatTime(duration)}</span>
      </div>

      {/* Transport controls */}
      <div className="flex items-center justify-center gap-3 py-3 shrink-0">
        <button
          onClick={onPrevious}
          aria-label="Previous"
          className="text-text-secondary hover:text-text-primary transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>
        <button
          onClick={onPlayPause}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="w-9 h-9 rounded-full bg-text-primary text-bg-primary flex items-center justify-center hover:opacity-90 transition-opacity"
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 ml-0.5">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <button
          onClick={onNext}
          aria-label="Next"
          className="text-text-secondary hover:text-text-primary transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
        </button>
      </div>
    </div>
  );
};

const PanelToggle = ({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className={`p-1.5 rounded transition-colors ${
      active ? "text-accent bg-accent/10" : "text-text-tertiary hover:text-text-secondary"
    }`}
    title={title}
    aria-label={title}
    aria-pressed={active}
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5">
      {children}
    </svg>
  </button>
);
