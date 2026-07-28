import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { usePlayback } from "../../../contexts/PlaybackContext";
import { useArtCache } from "../../../contexts/ArtCacheContext";
import { AlphabetScroller } from "../../atoms/AlphabetScroller/AlphabetScroller";
import { buildLetterMap, getAlbumLetter } from "../../atoms/AlphabetScroller/helpers";
import { CoverFlowLyrics } from "./CoverFlowLyrics";
import { ArtistPicker } from "./ArtistPicker";
import { DensityStepper } from "./DensityStepper";
import {
  applyPositions,
  availableX,
  buildItemStyle,
  buildTransforms,
  coverSizePx,
  findCenteredIndex,
  sortAlbums,
} from "./helpers";
import { COVER_HEIGHT_CSS, PERSPECTIVE_PX } from "./constants";
import { getSetting, setSetting } from "../../../utils/settings";
import type { ArtworkCarouselProps, AlbumArtProps } from "./types";

// Damped spring: stiffness=70, critical damping ≈ 16.7, using 15 = slightly underdamped (tiny overshoot)
const SPRING_STIFFNESS = 70;
const SPRING_DAMPING = 15;

export const ArtworkCarousel = ({
  albums,
  selectedAlbum,
  onSelectAlbum,
  onPlayAlbum,
  sortMode = "album",
  onSortModeChange,
  artists,
  selectedArtist,
  onSelectArtist,
  lyricsOverlay = false,
  onLyricsOverlayDismiss,
}: ArtworkCarouselProps) => {
  const {
    state: { currentTrack },
  } = usePlayback();
  const { artCacheBust } = useArtCache();
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const wheelAccumRef = useRef(0);
  const lastNavRef = useRef(0);

  const [sideCount, setSideCount] = useState(() => getSetting("coverFlowSideCount"));
  const renderRange = sideCount + 1;

  const handleSideCountChange = useCallback((next: number) => {
    setSideCount(next);
    setSetting("coverFlowSideCount", next);
  }, []);

  // Stage size drives cover size and how far the rack may reach
  const [stage, setStage] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setStage((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Rounded, so resizing only rebuilds the rack when the layout actually changes
  const roomX = availableX(stage.width, coverSizePx(stage.height));
  const transforms = useMemo(() => buildTransforms(sideCount, roomX), [sideCount, roomX]);

  // Spring state — refs only, never triggers re-renders
  const posRef = useRef<number | null>(null);
  const velRef = useRef(0);
  const rafRef = useRef(0);
  const prevTimeRef = useRef(0);

  const sortedAlbums = useMemo(() => sortAlbums(albums, sortMode), [albums, sortMode]);
  const letterMap = useMemo(() => buildLetterMap(sortedAlbums, sortMode), [sortedAlbums, sortMode]);
  const centeredIndex = findCenteredIndex(sortedAlbums, selectedAlbum, currentTrack?.album);
  const centeredAlbum = sortedAlbums[centeredIndex];
  const activeLetter = centeredAlbum ? getAlbumLetter(centeredAlbum, sortMode) : undefined;

  // Initialize position on first render
  if (posRef.current === null) posRef.current = centeredIndex;

  // Snap immediately on large jumps (sort mode change, etc.)
  if (Math.abs(centeredIndex - posRef.current) > sideCount) {
    posRef.current = centeredIndex;
    velRef.current = 0;
  }

  // Damped spring animation — writes directly to DOM, zero React overhead per frame.
  // Restarts on density change so new transforms apply from the current position.
  useEffect(() => {
    let active = true;
    prevTimeRef.current = performance.now();

    const step = (now: number) => {
      if (!active) return;

      const dt = Math.min((now - prevTimeRef.current) / 1000, 0.04);
      prevTimeRef.current = now;

      const pos = posRef.current!;
      const displacement = centeredIndex - pos;
      const acc = SPRING_STIFFNESS * displacement - SPRING_DAMPING * velRef.current;
      velRef.current += acc * dt;
      posRef.current = pos + velRef.current * dt;

      // Settle when both velocity and displacement are negligible
      if (Math.abs(velRef.current) < 0.08 && Math.abs(centeredIndex - posRef.current) < 0.003) {
        posRef.current = centeredIndex;
        velRef.current = 0;
        applyPositions(stageRef.current, centeredIndex, transforms);
        return;
      }

      applyPositions(stageRef.current, posRef.current, transforms);
      rafRef.current = requestAnimationFrame(step);
    };

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);

    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [centeredIndex, transforms]);

  const navigate = useCallback(
    (direction: -1 | 1) => {
      const nextIndex = centeredIndex + direction;
      if (nextIndex >= 0 && nextIndex < sortedAlbums.length) {
        onSelectAlbum(sortedAlbums[nextIndex].name);
      }
    },
    [centeredIndex, sortedAlbums, onSelectAlbum],
  );

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!containerRef.current?.closest("[data-carousel-active]")) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigate(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        navigate(1);
      } else if (e.key === "Enter" && centeredAlbum) {
        e.preventDefault();
        onPlayAlbum(centeredAlbum.name);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, centeredAlbum, onPlayAlbum]);

  // Mouse wheel / trackpad scroll
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      wheelAccumRef.current += delta;
      const now = Date.now();
      if (Math.abs(wheelAccumRef.current) >= 50 && now - lastNavRef.current > 100) {
        navigate(wheelAccumRef.current > 0 ? 1 : -1);
        wheelAccumRef.current = 0;
        lastNavRef.current = now;
      }
    },
    [navigate],
  );

  const handleLetterSelect = useCallback(
    (_letter: string, albumIndex: number) => {
      if (albumIndex >= 0 && albumIndex < sortedAlbums.length) {
        onSelectAlbum(sortedAlbums[albumIndex].name);
      }
    },
    [sortedAlbums, onSelectAlbum],
  );

  // Ambient background art URL for center album
  const ambientArtUrl = useMemo(() => {
    if (!centeredAlbum?.folder_path) return null;
    return convertFileSrc(centeredAlbum.folder_path + "/cover.jpg") + (artCacheBust ? `?v=${artCacheBust}` : "");
  }, [centeredAlbum?.folder_path, artCacheBust]);

  if (sortedAlbums.length === 0) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center">
        <span className="text-text-tertiary text-xs">No albums in library</span>
      </div>
    );
  }

  // Read current animated position for initial inline styles (rAF takes over next frame)
  const currentPos = posRef.current ?? centeredIndex;

  return (
    <div
      ref={containerRef}
      data-carousel-active
      className="relative w-full h-full bg-black flex flex-col overflow-hidden select-none"
      onWheel={handleWheel}
    >
      <AmbientBackground artUrl={ambientArtUrl} />

      {artists && onSelectArtist && (
        <ArtistPicker artists={artists} selectedArtist={selectedArtist ?? null} onSelectArtist={onSelectArtist} />
      )}

      <div className="absolute top-2 right-3 z-10 flex items-center gap-1.5">
        {onSortModeChange && (
          <div className="flex gap-0.5 bg-white/5 backdrop-blur-sm rounded-md p-0.5">
            <SortButton active={sortMode === "album"} onClick={() => onSortModeChange("album")} label="Album" />
            <SortButton active={sortMode === "artist"} onClick={() => onSortModeChange("artist")} label="Artist" />
          </div>
        )}
        <DensityStepper sideCount={sideCount} onChange={handleSideCountChange} />
      </div>

      {/* Carousel stage — rAF directly manipulates children via data-idx */}
      <div
        ref={stageRef}
        className="relative flex-1 min-h-0 w-full flex items-center justify-center"
        style={{ perspective: `${PERSPECTIVE_PX}px`, perspectiveOrigin: "50% 40%" }}
      >
        {sortedAlbums.map((album, i) => {
          const intOffset = i - centeredIndex;
          if (Math.abs(intOffset) > renderRange) return null;
          const clickable = Math.abs(intOffset) <= sideCount;
          const initial = buildItemStyle(transforms, i - currentPos);
          return (
            <div
              key={album.folder_path}
              data-idx={i}
              className={`absolute ${intOffset !== 0 && clickable ? "cursor-pointer" : ""}`}
              style={{
                height: COVER_HEIGHT_CSS,
                aspectRatio: "1",
                transform: initial.transform,
                opacity: Number(initial.opacity),
                zIndex: Number(initial.zIndex),
                willChange: "transform, opacity",
                transformStyle: "preserve-3d",
                pointerEvents: clickable ? undefined : "none",
              }}
              onClick={
                clickable
                  ? () => {
                      if (intOffset !== 0) {
                        onSelectAlbum(album.name);
                        if (lyricsOverlay) onLyricsOverlayDismiss?.();
                      }
                    }
                  : undefined
              }
              onDoubleClick={
                clickable
                  ? () => {
                      onSelectAlbum(album.name);
                      onPlayAlbum(album.name);
                    }
                  : undefined
              }
            >
              <AlbumArt album={album} isCenter={intOffset === 0} />
            </div>
          );
        })}

        <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />
      </div>

      {lyricsOverlay && <CoverFlowLyrics />}

      {/* Alphabet scroller */}
      <div className="absolute right-0 top-0 bottom-0 z-10 flex items-center">
        <AlphabetScroller
          letterMap={letterMap}
          activeLetter={activeLetter}
          onLetterSelect={handleLetterSelect}
          variant="dark"
        />
      </div>

      {/* Album info bar */}
      {centeredAlbum && (
        <div className="relative shrink-0 py-3 flex flex-col items-center gap-0.5">
          <div className="absolute inset-0 bg-white/[0.03] backdrop-blur-xl" />
          {currentTrack?.album === centeredAlbum.name && currentTrack.title && (
            <div className="relative text-white text-sm font-semibold truncate max-w-sm px-6">{currentTrack.title}</div>
          )}
          <div className="relative text-white/45 text-xs truncate max-w-sm px-6">
            {centeredAlbum.artist || "Unknown Artist"} - {centeredAlbum.name}
            {centeredAlbum.year ? ` · ${centeredAlbum.year}` : ""}
          </div>
        </div>
      )}
    </div>
  );
};

/** Crossfading ambient background — stacks two layers so old image fades out while new fades in. */
const AmbientBackground = ({ artUrl }: { artUrl: string | null }) => {
  const [layers, setLayers] = useState<{ url: string; key: number }[]>([]);
  const counterRef = useRef(0);

  useEffect(() => {
    if (!artUrl) {
      setLayers([]);
      return;
    }
    counterRef.current += 1;
    const key = counterRef.current;
    setLayers((prev) => [...prev.slice(-1), { url: artUrl, key }]);
  }, [artUrl]);

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {layers.map(({ url, key }, i) => (
        <img
          key={key}
          src={url}
          alt=""
          className="absolute inset-0 w-full h-full object-cover scale-150 blur-[80px] saturate-150"
          style={{
            opacity: i === layers.length - 1 ? 0.15 : 0,
            transition: "opacity 0.6s ease-out",
          }}
          draggable={false}
          onTransitionEnd={() => {
            setLayers((prev) => (prev.length > 1 ? prev.slice(-1) : prev));
          }}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80" />
    </div>
  );
};

/** Album artwork + reflection. No positioning — parent handles that. */
const AlbumArt = ({ album, isCenter }: AlbumArtProps) => {
  const { artCacheBust } = useArtCache();
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const artUrl =
    album.folder_path && !failed
      ? convertFileSrc(album.folder_path + "/cover.jpg") + (artCacheBust ? `?v=${artCacheBust}` : "")
      : null;

  return (
    <>
      <div
        className="w-full h-full rounded-md overflow-hidden"
        style={{
          boxShadow: isCenter
            ? "0 12px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.08)"
            : "0 4px 20px rgba(0,0,0,0.5)",
          transition: "box-shadow 0.4s ease-out",
        }}
      >
        {artUrl ? (
          <img
            src={artUrl}
            alt={album.name}
            className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
            draggable={false}
            onError={() => setFailed(true)}
            onLoad={() => setLoaded(true)}
          />
        ) : (
          <div className="w-full h-full bg-bg-elevated flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="w-1/3 h-1/3 text-text-tertiary/40"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Reflection */}
      <div
        className="w-full overflow-hidden rounded-md pointer-events-none"
        aria-hidden
        style={{
          height: "30%",
          marginTop: "2px",
          transform: "scaleY(-1)",
          opacity: artUrl && loaded ? 1 : 0,
          maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.18), transparent 70%)",
          WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,0.18), transparent 70%)",
        }}
      >
        {artUrl && <img src={artUrl} alt="" className="w-full h-full object-cover object-bottom" draggable={false} />}
      </div>
    </>
  );
};

const SortButton = ({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) => (
  <button
    onClick={onClick}
    className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
      active ? "bg-white/15 text-white shadow-sm" : "text-white/35 hover:text-white/55"
    }`}
  >
    {label}
  </button>
);
