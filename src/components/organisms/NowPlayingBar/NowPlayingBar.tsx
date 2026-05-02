import { useState, useEffect, useCallback, useRef } from "react";
import { usePlayback, usePlaybackTime } from "../../../contexts/PlaybackContext";
import { AlbumArtwork } from "../../atoms/AlbumArtwork/AlbumArtwork";
import { SeekBar } from "../../atoms/SeekBar/SeekBar";
import { NowPlayingInfo } from "../../molecules/NowPlayingInfo/NowPlayingInfo";
import { TransportControls } from "../../molecules/TransportControls/TransportControls";
import { VolumeControl } from "../../molecules/VolumeControl/VolumeControl";
import { getDragPayload } from "../TrackTable/TrackTable";

interface NowPlayingBarProps {
  onToggleQueue?: () => void;
  queueOpen?: boolean;
  onToggleMiniPlayer?: () => void;
  miniPlayer?: boolean;
  showColumnBrowser?: boolean;
  showInfoPanel?: boolean;
  showStatsPanel?: boolean;
  showPlaylistSidebar?: boolean;
  onToggleColumnBrowser?: () => void;
  onToggleInfoPanel?: () => void;
  onToggleStatsPanel?: () => void;
  onTogglePlaylistSidebar?: () => void;
  showAlbumGrid?: boolean;
  onToggleAlbumGrid?: () => void;
}

export const NowPlayingBar = ({
  onToggleQueue,
  queueOpen,
  onToggleMiniPlayer,
  miniPlayer,
  showColumnBrowser,
  showInfoPanel,
  showStatsPanel,
  showPlaylistSidebar,
  onToggleColumnBrowser,
  onToggleInfoPanel,
  onToggleStatsPanel,
  onTogglePlaylistSidebar,
  showAlbumGrid,
  onToggleAlbumGrid,
}: NowPlayingBarProps) => {
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
      switch (e.code) {
        case "Space":
          e.preventDefault();
          handlePlayPause();
          break;
        case "ArrowLeft":
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            previous();
          } else {
            e.preventDefault();
            const newFrac = Math.max(0, (t.currentTime - 10) / t.duration);
            seekTo(newFrac);
          }
          break;
        case "ArrowRight":
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            next();
          } else {
            e.preventDefault();
            const newFrac = Math.min(1, (t.currentTime + 10) / t.duration);
            seekTo(newFrac);
          }
          break;
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
      className={`h-[72px] border-t bg-bg-secondary px-6 flex items-center gap-4 shrink-0 transition-colors ${
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
      <div className="w-[240px] shrink-0">
        {state.playbackError ? (
          <div className="flex items-center gap-2">
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
        {!miniPlayer && onTogglePlaylistSidebar && (
          <PanelToggle active={showPlaylistSidebar} onClick={onTogglePlaylistSidebar} title="Playlists">
            <path strokeLinecap="round" d="M4 6h16M4 10h12M4 14h14M4 18h10" />
          </PanelToggle>
        )}
        {!miniPlayer && onToggleColumnBrowser && (
          <PanelToggle
            active={showColumnBrowser && !showAlbumGrid}
            onClick={onToggleColumnBrowser}
            title="Column browser"
          >
            <rect x="3" y="3" width="5" height="18" rx="1" />
            <rect x="10" y="3" width="5" height="18" rx="1" />
            <rect x="17" y="3" width="5" height="18" rx="1" />
          </PanelToggle>
        )}
        {!miniPlayer && onToggleAlbumGrid && (
          <PanelToggle active={showAlbumGrid} onClick={onToggleAlbumGrid} title="Album grid">
            <rect x="3" y="3" width="8" height="8" rx="1" />
            <rect x="13" y="3" width="8" height="8" rx="1" />
            <rect x="3" y="13" width="8" height="8" rx="1" />
            <rect x="13" y="13" width="8" height="8" rx="1" />
          </PanelToggle>
        )}
        {!miniPlayer && onToggleInfoPanel && (
          <PanelToggle active={showInfoPanel} onClick={onToggleInfoPanel} title="Info panel">
            <circle cx="12" cy="12" r="9" />
            <path strokeLinecap="round" d="M12 11v5M12 8h.01" />
          </PanelToggle>
        )}
        {!miniPlayer && onToggleStatsPanel && (
          <PanelToggle active={showStatsPanel} onClick={onToggleStatsPanel} title="Library stats">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16l4-6 4 3 5-7" />
          </PanelToggle>
        )}
        {!miniPlayer && <div className="w-px h-4 bg-border mx-1" />}
        <VolumeControl volume={state.volume} onChange={setVolume} />
        {onToggleQueue && !miniPlayer && (
          <button
            onClick={onToggleQueue}
            className={`p-1.5 rounded transition-colors ${
              queueOpen ? "text-accent bg-accent/10" : "text-text-tertiary hover:text-text-secondary"
            }`}
            title="Queue"
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
  track: { title: string | null; artist: string | null; file_name: string; folder_path: string };
  isPlaying: boolean;
  fraction: number;
  currentTime: number;
  duration: number;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (fraction: number) => void;
  onExpand?: () => void;
}) => (
  <div className="flex flex-col flex-1 h-full bg-bg-secondary select-none overflow-hidden">
    {/* Album art — shrinks to fit, controls always visible */}
    <div className="flex-1 min-h-0 relative overflow-hidden">
      <AlbumArtwork folderPath={track.folder_path} size="full" className="!rounded-none !aspect-auto !h-full" />
      {/* Expand button overlay */}
      {onExpand && (
        <button
          onClick={onExpand}
          className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/40 text-white/80 hover:text-white hover:bg-black/60 transition-colors"
          title="Exit mini player"
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

    {/* Track info */}
    <div className="px-4 pt-3 pb-2 shrink-0">
      <div className="text-xs font-medium text-text-primary truncate text-center">{track.title || track.file_name}</div>
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
      <button onClick={onPrevious} className="text-text-secondary hover:text-text-primary transition-colors">
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
          <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
        </svg>
      </button>
      <button
        onClick={onPlayPause}
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
      <button onClick={onNext} className="text-text-secondary hover:text-text-primary transition-colors">
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
          <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
        </svg>
      </button>
    </div>
  </div>
);

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
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5">
      {children}
    </svg>
  </button>
);
