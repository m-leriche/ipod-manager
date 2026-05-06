import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePlaybackTime } from "../../../contexts/PlaybackContext";
import { parseLrc, findActiveLine } from "./helpers";
import type { TrackLyrics } from "./types";
import type { LibraryTrack } from "../../../types/library";

interface LyricsPanelProps {
  track: LibraryTrack;
  variant?: "panel" | "overlay";
}

export const LyricsPanel = ({ track, variant = "panel" }: LyricsPanelProps) => {
  const { currentTime } = usePlaybackTime();
  const [lyrics, setLyrics] = useState<TrackLyrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const lastTrackIdRef = useRef<number | null>(null);

  // Load lyrics from DB when track changes
  useEffect(() => {
    if (lastTrackIdRef.current === track.id) return;
    lastTrackIdRef.current = track.id;

    setLoading(true);
    setError(null);
    setLyrics(null);

    invoke<TrackLyrics>("get_lyrics", { trackId: track.id })
      .then((result) => {
        if (result.lyrics || result.synced_lyrics) {
          setLyrics(result);
        }
      })
      .catch(() => {
        // No lyrics in DB yet — that's fine
      })
      .finally(() => setLoading(false));
  }, [track.id]);

  const handleFetch = useCallback(async () => {
    if (!track.artist && !track.title) return;

    setFetching(true);
    setError(null);

    try {
      const result = await invoke<TrackLyrics>("fetch_lyrics", {
        trackId: track.id,
        artist: track.artist || "",
        title: track.title || track.file_name,
        album: track.album,
        durationSecs: track.duration_secs || null,
      });
      setLyrics(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setFetching(false);
    }
  }, [track]);

  // Parse synced lyrics
  const syncedLyricsText = lyrics?.synced_lyrics ?? null;
  const syncedLines = useMemo(() => (syncedLyricsText ? parseLrc(syncedLyricsText) : null), [syncedLyricsText]);

  const activeLine = syncedLines ? findActiveLine(syncedLines, currentTime) : -1;

  // Auto-scroll to active line
  useEffect(() => {
    if (activeLine < 0 || !activeLineRef.current || !containerRef.current) return;

    activeLineRef.current.scrollIntoView?.({
      behavior: "smooth",
      block: "center",
    });
  }, [activeLine]);

  const isOverlay = variant === "overlay";
  const baseClass = isOverlay ? "flex flex-col h-full px-4 py-3" : "flex flex-col h-full bg-bg-secondary";

  // No lyrics yet — show fetch prompt
  if (!loading && !lyrics) {
    return (
      <div className={baseClass}>
        {!isOverlay && <PanelHeader />}
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
          <LyricsIcon className="w-8 h-8 text-text-tertiary" />
          <p className="text-xs text-text-tertiary text-center">No lyrics available</p>
          <button
            onClick={handleFetch}
            disabled={fetching || (!track.artist && !track.title)}
            className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
          >
            {fetching ? "Searching..." : "Search Online"}
          </button>
          {error && <p className="text-[10px] text-red-400 text-center max-w-[200px]">{error}</p>}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={baseClass}>
        {!isOverlay && <PanelHeader />}
        <div className="flex-1 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-text-tertiary/30 border-t-text-tertiary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Synced lyrics view
  if (syncedLines && syncedLines.length > 0) {
    return (
      <div className={baseClass}>
        {!isOverlay && <PanelHeader onRefetch={handleFetch} fetching={fetching} />}
        <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-6 scroll-smooth">
          <div className="space-y-2">
            {syncedLines.map((line, i) => (
              <div
                key={i}
                ref={i === activeLine ? activeLineRef : undefined}
                className={`transition-all duration-300 ${
                  i === activeLine
                    ? isOverlay
                      ? "text-white text-base font-semibold"
                      : "text-text-primary text-sm font-semibold"
                    : isOverlay
                      ? "text-white/40 text-sm"
                      : "text-text-tertiary text-xs"
                } ${line.text === "" ? "h-4" : ""}`}
              >
                {line.text || "\u00A0"}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Plain lyrics view
  return (
    <div className={baseClass}>
      {!isOverlay && <PanelHeader onRefetch={handleFetch} fetching={fetching} />}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <pre
          className={`whitespace-pre-wrap font-sans text-xs leading-relaxed ${isOverlay ? "text-white/80" : "text-text-secondary"}`}
        >
          {lyrics?.lyrics}
        </pre>
      </div>
    </div>
  );
};

const PanelHeader = ({ onRefetch, fetching }: { onRefetch?: () => void; fetching?: boolean }) => (
  <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
    <span className="text-[11px] font-medium text-text-secondary uppercase tracking-wide">Lyrics</span>
    {onRefetch && (
      <button
        onClick={onRefetch}
        disabled={fetching}
        className="text-[10px] text-text-tertiary hover:text-accent transition-colors disabled:opacity-50"
        title="Search for lyrics online"
      >
        {fetching ? "Searching..." : "Refetch"}
      </button>
    )}
  </div>
);

const LyricsIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V4.5l-10.5 3v7.553m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z"
    />
  </svg>
);
