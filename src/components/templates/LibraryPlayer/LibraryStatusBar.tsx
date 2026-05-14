import { useMemo } from "react";
import { useEqualizer } from "../../../contexts/EqualizerContext";
import { useBackgroundArtRepair } from "../../../contexts/BackgroundArtRepairContext";
import { useBackgroundLyrics } from "../../../contexts/BackgroundLyricsContext";
import { EqualizerPanel } from "../../organisms/EqualizerPanel/EqualizerPanel";
import type { LibraryTrack } from "../../../types/library";

interface LibraryStatusBarProps {
  selectedTracks: LibraryTrack[];
  hideSelectionStats?: boolean;
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

export const LibraryStatusBar = ({ selectedTracks, hideSelectionStats }: LibraryStatusBarProps) => {
  const { isOpen: eqOpen, setIsOpen: setEqOpen, state: eqState } = useEqualizer();
  const { state: artRepair, cancel: cancelRepair } = useBackgroundArtRepair();
  const { state: lyricsFetch, cancel: cancelLyricsFetch } = useBackgroundLyrics();

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

  const artProgressPct = artRepair.total > 0 ? (artRepair.completed / artRepair.total) * 100 : 0;
  const lyricsProgressPct = lyricsFetch.total > 0 ? (lyricsFetch.completed / lyricsFetch.total) * 100 : 0;
  const bgActive = artRepair.active || lyricsFetch.active;

  // In CoverFlow/Album Art mode, hide entirely unless a background process is running
  if (hideSelectionStats && !bgActive) {
    return <EqualizerPanel />;
  }

  return (
    <>
      <EqualizerPanel />
      <div className="h-[26px] border-t border-border bg-bg-secondary px-3 flex items-center gap-3 shrink-0 text-[10px] text-text-tertiary relative">
        {/* EQ button */}
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

        {bgActive ? (
          <>
            {/* Background progress bar (behind text) */}
            <div className="absolute left-0 bottom-0 h-[2px] bg-accent/20 w-full">
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${artRepair.active ? artProgressPct : lyricsProgressPct}%` }}
              />
            </div>
            {/* Progress text */}
            <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="w-3 h-3 shrink-0 text-accent animate-spin"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
                />
              </svg>
              {artRepair.active ? (
                <span className="text-text-secondary truncate">
                  Repairing art: {artRepair.completed}/{artRepair.total}
                  {artRepair.currentItem && ` \u2014 ${artRepair.currentItem}`}
                </span>
              ) : (
                <span className="text-text-secondary truncate">
                  Fetching lyrics: {lyricsFetch.completed}/{lyricsFetch.total}
                  {lyricsFetch.currentItem && ` \u2014 ${lyricsFetch.currentItem}`}
                </span>
              )}
              <button
                onClick={artRepair.active ? cancelRepair : cancelLyricsFetch}
                className="shrink-0 text-text-tertiary hover:text-text-secondary transition-colors"
                title={artRepair.active ? "Cancel repair" : "Cancel lyrics fetch"}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 text-center tabular-nums">
            {stats.label}
            {selectedTracks.length > 0 && (
              <>
                , {stats.size}, {stats.duration}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
};
