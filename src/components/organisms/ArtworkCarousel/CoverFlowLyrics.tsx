import { useState, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePlayback, usePlaybackTime } from "../../../contexts/PlaybackContext";
import { parseLrc, findActiveLine } from "../LyricsPanel/helpers";
import type { TrackLyrics } from "../LyricsPanel/types";

const LYRICS_SIZE_KEY = "crate-lyrics-overlay-size";
type LyricsSize = 1 | 1.25 | 1.5;
const SIZES: LyricsSize[] = [1, 1.25, 1.5];
const BASE_SIZE_PX = 14;

export const CoverFlowLyrics = () => {
  const {
    state: { currentTrack },
  } = usePlayback();
  const { currentTime } = usePlaybackTime();
  const [lyrics, setLyrics] = useState<TrackLyrics | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef<HTMLDivElement>(null);
  const [translateY, setTranslateY] = useState(0);
  const lastTrackIdRef = useRef<number | null>(null);
  const [size, setSize] = useState<LyricsSize>(() => {
    const stored = localStorage.getItem(LYRICS_SIZE_KEY);
    return stored && SIZES.includes(Number(stored) as LyricsSize) ? (Number(stored) as LyricsSize) : 1;
  });

  const handleSizeChange = (s: LyricsSize) => {
    setSize(s);
    localStorage.setItem(LYRICS_SIZE_KEY, String(s));
  };

  // Load lyrics when track changes
  useEffect(() => {
    if (!currentTrack || lastTrackIdRef.current === currentTrack.id) return;
    lastTrackIdRef.current = currentTrack.id;
    setLoading(true);
    setLyrics(null);
    setTranslateY(0);

    invoke<TrackLyrics>("get_lyrics", { trackId: currentTrack.id })
      .then((result) => {
        if (result.lyrics || result.synced_lyrics) setLyrics(result);
      })
      .catch((e: unknown) => console.warn("Failed to fetch lyrics:", e))
      .finally(() => setLoading(false));
  }, [currentTrack]);

  const syncedLyricsText = lyrics?.synced_lyrics ?? null;
  const syncedLines = useMemo(() => (syncedLyricsText ? parseLrc(syncedLyricsText) : null), [syncedLyricsText]);
  const activeLine = syncedLines ? findActiveLine(syncedLines, currentTime) : -1;

  // Smooth scroll via GPU-composited transform
  useEffect(() => {
    if (activeLine < 0 || !containerRef.current || !linesRef.current) return;
    const lineEl = linesRef.current.children[activeLine] as HTMLElement | undefined;
    if (!lineEl) return;

    const containerH = containerRef.current.clientHeight;
    setTranslateY(-(lineEl.offsetTop - containerH * 0.45 + lineEl.offsetHeight / 2));
  }, [activeLine, size]);

  if (!currentTrack || loading || !syncedLines?.length) return null;

  const fontSize = BASE_SIZE_PX * size;

  return (
    <div className="absolute inset-0 z-[5] flex items-center justify-center pointer-events-none">
      <div className="w-[70%] max-w-lg h-[85%] rounded-2xl bg-black/25 backdrop-blur-[2px] overflow-hidden pointer-events-auto relative">
        <div ref={containerRef} className="h-full overflow-hidden px-6">
          <div
            ref={linesRef}
            className="transition-transform duration-700 ease-in-out pt-[45%]"
            style={{ transform: `translateY(${translateY}px)` }}
          >
            {syncedLines.map((line, i) => {
              const isActive = i === activeLine;
              return (
                <div
                  key={i}
                  style={{ fontSize: `${fontSize}px` }}
                  className={`py-2 text-center transition-[color,opacity,transform] duration-500 ease-in-out origin-center ${
                    isActive ? "text-white font-semibold scale-[1.08] opacity-100" : "text-white/30 opacity-60"
                  }`}
                >
                  {line.text || "\u00A0"}
                </div>
              );
            })}
            {/* Bottom padding so last line can center */}
            <div className="h-[50%]" />
          </div>
        </div>
        {/* Size controls */}
        <div className="absolute bottom-3 left-0 right-0 flex justify-center items-end gap-1.5">
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => handleSizeChange(s)}
              className={`leading-none transition-colors ${
                s === size ? "text-white" : "text-white/30 hover:text-white/50"
              }`}
              style={{ fontSize: `${10 + (s - 1) * 12}px` }}
              title={`${s}x`}
            >
              A
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
