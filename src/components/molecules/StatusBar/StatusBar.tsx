import { useProgress, useProgressState } from "../../../contexts/ProgressContext";
import { useBackgroundArtRepair } from "../../../contexts/BackgroundArtRepairContext";
import { useBackgroundLyrics } from "../../../contexts/BackgroundLyricsContext";
import { useLastfmState } from "../../../contexts/LastfmContext";
import type { LibrarySummary } from "./types";

interface StatusBarProps {
  librarySummary: LibrarySummary | null;
  ipodConnected: boolean;
}

export const StatusBar = ({ librarySummary, ipodConnected }: StatusBarProps) => {
  const progress = useProgressState();
  const { cancel: cancelProgress } = useProgress();
  const { state: artRepair, cancel: cancelArtRepair } = useBackgroundArtRepair();
  const { state: lyricsFetch, cancel: cancelLyricsFetch } = useBackgroundLyrics();
  const lastfm = useLastfmState();

  const activeOp = progress.active ? progress : artRepair.active ? artRepair : lyricsFetch.active ? lyricsFetch : null;

  const activeLabel = progress.active
    ? progress.title
    : artRepair.active
      ? "Repairing album art"
      : lyricsFetch.active
        ? "Fetching lyrics"
        : null;

  const activeCancel = progress.active
    ? progress.canCancel
      ? cancelProgress
      : null
    : artRepair.active
      ? cancelArtRepair
      : lyricsFetch.active
        ? cancelLyricsFetch
        : null;

  const pct = activeOp && activeOp.total > 0 ? (activeOp.completed / activeOp.total) * 100 : 0;

  return (
    <div className="h-[22px] border-t border-border bg-bg-secondary px-3 flex items-center gap-3 shrink-0 text-[10px] text-text-tertiary relative select-none">
      {/* Progress bar (behind content) */}
      {activeOp && (
        <div className="absolute left-0 bottom-0 h-[2px] bg-accent/20 w-full">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: activeOp.total > 0 ? `${pct}%` : "100%" }}
          />
        </div>
      )}

      {/* Left: library stats */}
      <div className="flex items-center gap-2 tabular-nums shrink-0">
        {librarySummary ? (
          <>
            <span>
              {librarySummary.trackCount.toLocaleString()} {librarySummary.trackCount === 1 ? "track" : "tracks"}
            </span>
            <Dot />
            <span>
              {librarySummary.artistCount.toLocaleString()} {librarySummary.artistCount === 1 ? "artist" : "artists"}
            </span>
            <Dot />
            <span>
              {librarySummary.albumCount.toLocaleString()} {librarySummary.albumCount === 1 ? "album" : "albums"}
            </span>
          </>
        ) : (
          <span>No library</span>
        )}
      </div>

      {/* Center: active operation */}
      {activeOp && (
        <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
          <SpinnerIcon />
          <span className="text-text-secondary truncate">
            {activeLabel}
            {activeOp.total > 0 && (
              <>
                : {activeOp.completed}/{activeOp.total}
              </>
            )}
            {activeOp.currentItem && <> &mdash; {activeOp.currentItem}</>}
          </span>
          {activeCancel && (
            <button
              onClick={activeCancel}
              className="shrink-0 text-text-tertiary hover:text-text-secondary transition-colors"
              title="Cancel"
              aria-label="Cancel"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Spacer when no operation */}
      {!activeOp && <div className="flex-1" />}

      {/* Right: connection indicators */}
      <div className="flex items-center gap-2 shrink-0">
        {ipodConnected && (
          <span className="flex items-center gap-1" title="iPod connected">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 text-text-tertiary">
              <path d="M12 2C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2 14h-4v-1h4v1zm0-2h-4v-1h4v1zm-1.5-3.59V13h-1v-2.59L9.67 8.59 10.33 7.93 12 9.59l1.67-1.67.67.67-1.84 1.82z" />
            </svg>
            <span>iPod</span>
          </span>
        )}
        {lastfm?.connected && (
          <span className="flex items-center gap-1" title={`Last.fm: ${lastfm.username}`}>
            <StatusDot color="text-success" />
            <span>Last.fm</span>
          </span>
        )}
      </div>
    </div>
  );
};

const Dot = () => <span className="text-text-tertiary/50">&middot;</span>;

const StatusDot = ({ color }: { color: string }) => (
  <span className={`inline-block w-1.5 h-1.5 rounded-full bg-current ${color}`} />
);

const SpinnerIcon = () => (
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
);
