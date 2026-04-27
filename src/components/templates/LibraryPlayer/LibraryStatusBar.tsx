import { useMemo } from "react";
import { useEqualizer } from "../../../contexts/EqualizerContext";
import { EqualizerPanel } from "../../organisms/EqualizerPanel/EqualizerPanel";
import type { LibraryTrack } from "../../../types/library";

interface LibraryStatusBarProps {
  selectedTracks: LibraryTrack[];
  showColumnBrowser: boolean;
  showInfoPanel: boolean;
  showStatsPanel: boolean;
  showPlaylistSidebar: boolean;
  onToggleColumnBrowser: () => void;
  onToggleInfoPanel: () => void;
  onToggleStatsPanel: () => void;
  onTogglePlaylistSidebar: () => void;
}

const formatSize = (bytes: number): string => {
  if (bytes === 0) return "0 bytes";
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatDuration = (totalSecs: number): string => {
  if (totalSecs === 0) return "0 seconds";
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = Math.floor(totalSecs % 60);

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds} ${seconds === 1 ? "second" : "seconds"}`);
  return parts.join(", ");
};

export const LibraryStatusBar = ({
  selectedTracks,
  showColumnBrowser,
  showInfoPanel,
  showStatsPanel,
  showPlaylistSidebar,
  onToggleColumnBrowser,
  onToggleInfoPanel,
  onToggleStatsPanel,
  onTogglePlaylistSidebar,
}: LibraryStatusBarProps) => {
  const { isOpen: eqOpen, setIsOpen: setEqOpen, state: eqState } = useEqualizer();

  const stats = useMemo(() => {
    const count = selectedTracks.length;
    const totalSize = selectedTracks.reduce((sum, t) => sum + (t.file_size || 0), 0);
    const totalDuration = selectedTracks.reduce((sum, t) => sum + (t.duration_secs || 0), 0);
    return {
      label: count === 0 ? "0 tracks selected" : `${count} ${count === 1 ? "track" : "tracks"} selected`,
      size: formatSize(totalSize),
      duration: formatDuration(totalDuration),
    };
  }, [selectedTracks]);

  return (
    <>
      <EqualizerPanel />
      <div className="h-[26px] border-t border-border bg-bg-secondary px-3 flex items-center gap-3 shrink-0 text-[10px] text-text-tertiary">
        {/* Left — EQ button */}
        <button
          data-eq-toggle
          onClick={() => setEqOpen(!eqOpen)}
          className={`shrink-0 p-0.5 rounded transition-colors ${
            eqOpen
              ? "text-accent bg-accent/10"
              : eqState.enabled
                ? "text-accent hover:bg-bg-hover"
                : "text-text-tertiary hover:text-text-secondary hover:bg-bg-hover"
          }`}
          title="Equalizer"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
            <path strokeLinecap="round" d="M4 8h4m4 0h8M4 16h8m4 0h4" />
            <circle cx="10" cy="8" r="2" fill="currentColor" stroke="none" />
            <circle cx="14" cy="16" r="2" fill="currentColor" stroke="none" />
          </svg>
        </button>

        {/* Center — Selection stats */}
        <div className="flex-1 text-center tabular-nums">
          {stats.label}
          {selectedTracks.length > 0 && (
            <>
              , {stats.size}, {stats.duration}
            </>
          )}
        </div>

        {/* Right — Panel toggles */}
        <div className="flex items-center gap-1">
          {/* Playlist sidebar toggle */}
          <button
            onClick={onTogglePlaylistSidebar}
            className={`p-0.5 rounded transition-colors ${
              showPlaylistSidebar
                ? "text-accent bg-accent/10"
                : "text-text-tertiary hover:text-text-secondary hover:bg-bg-hover"
            }`}
            title={showPlaylistSidebar ? "Hide playlists" : "Show playlists"}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5">
              <path strokeLinecap="round" d="M4 6h16M4 10h12M4 14h14M4 18h10" />
            </svg>
          </button>

          {/* Column browser toggle */}
          <button
            onClick={onToggleColumnBrowser}
            className={`p-0.5 rounded transition-colors ${
              showColumnBrowser
                ? "text-accent bg-accent/10"
                : "text-text-tertiary hover:text-text-secondary hover:bg-bg-hover"
            }`}
            title={showColumnBrowser ? "Hide column browser" : "Show column browser"}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5">
              <rect x="3" y="3" width="5" height="18" rx="1" />
              <rect x="10" y="3" width="5" height="18" rx="1" />
              <rect x="17" y="3" width="5" height="18" rx="1" />
            </svg>
          </button>

          {/* Info panel toggle */}
          <button
            onClick={onToggleInfoPanel}
            className={`p-0.5 rounded transition-colors ${
              showInfoPanel
                ? "text-accent bg-accent/10"
                : "text-text-tertiary hover:text-text-secondary hover:bg-bg-hover"
            }`}
            title={showInfoPanel ? "Hide info panel" : "Show info panel"}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5">
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" d="M12 11v5M12 8h.01" />
            </svg>
          </button>

          {/* Stats panel toggle */}
          <button
            onClick={onToggleStatsPanel}
            className={`p-0.5 rounded transition-colors ${
              showStatsPanel
                ? "text-accent bg-accent/10"
                : "text-text-tertiary hover:text-text-secondary hover:bg-bg-hover"
            }`}
            title={showStatsPanel ? "Hide library stats" : "Show library stats"}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16l4-6 4 3 5-7" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
};
