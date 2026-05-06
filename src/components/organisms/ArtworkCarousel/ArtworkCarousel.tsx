import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { usePlayback } from "../../../contexts/PlaybackContext";
import { useArtCache } from "../../../contexts/ArtCacheContext";
import { AlphabetScroller } from "../../atoms/AlphabetScroller/AlphabetScroller";
import { buildLetterMap, getAlbumLetter } from "../../atoms/AlphabetScroller/helpers";
import type { ArtworkCarouselProps, AlbumArtProps } from "./types";
import type { AlbumSummary } from "../../../types/library";
import type { AlbumSortMode } from "../AlbumGrid/types";

const VISIBLE_RANGE = 3;
const RENDER_RANGE = VISIBLE_RANGE + 1;

// Transform configs per offset: [center, +-1, +-2, +-3, +-4 (exit)]
const TRANSFORMS = [
  { x: 0, ry: 0, z: 0, scale: 1, opacity: 1 },
  { x: 62, ry: 45, z: 200, scale: 0.62, opacity: 0.7 },
  { x: 100, ry: 50, z: 340, scale: 0.5, opacity: 0.4 },
  { x: 130, ry: 55, z: 440, scale: 0.42, opacity: 0.15 },
  { x: 155, ry: 58, z: 520, scale: 0.38, opacity: 0 },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Interpolate between transform configs for a continuous float offset. */
const interpolateConfig = (absOffset: number) => {
  const maxIdx = TRANSFORMS.length - 1;
  if (absOffset >= maxIdx) return TRANSFORMS[maxIdx];
  const lower = Math.floor(absOffset);
  const t = absOffset - lower;
  const a = TRANSFORMS[lower];
  const b = TRANSFORMS[lower + 1];
  return {
    x: lerp(a.x, b.x, t),
    ry: lerp(a.ry, b.ry, t),
    z: lerp(a.z, b.z, t),
    scale: lerp(a.scale, b.scale, t),
    opacity: lerp(a.opacity, b.opacity, t),
  };
};

// Damped spring: stiffness=70, critical damping ≈ 16.7, using 15 = slightly underdamped (tiny overshoot)
const SPRING_STIFFNESS = 70;
const SPRING_DAMPING = 15;

/** Build inline CSS for a given continuous offset from center. */
const buildItemStyle = (offset: number) => {
  const absOffset = Math.abs(offset);
  const sign = Math.sign(offset) || 1;
  const config = interpolateConfig(absOffset);
  return {
    transform: `translateX(${sign * config.x}%) rotateY(${-sign * config.ry}deg) translateZ(${-config.z}px) scale(${config.scale})`,
    opacity: String(config.opacity),
    zIndex: String(Math.round(100 - absOffset * 10)),
  };
};

/** Apply spring-animated positions directly to DOM (bypasses React rendering). */
const applyPositions = (stage: HTMLDivElement | null, pos: number) => {
  if (!stage) return;
  stage.querySelectorAll<HTMLDivElement>(":scope > [data-idx]").forEach((el) => {
    const { transform, opacity, zIndex } = buildItemStyle(Number(el.dataset.idx) - pos);
    el.style.transform = transform;
    el.style.opacity = opacity;
    el.style.zIndex = zIndex;
  });
};

/** Sort key matching the backend: strip "The ", remove non-alphanumeric, lowercase. */
const sortKey = (s: string): string => {
  const trimmed = s.trim();
  const withoutThe = /^the /i.test(trimmed) ? trimmed.slice(4) : trimmed;
  return withoutThe.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
};

const sortAlbums = (albums: AlbumSummary[], mode: AlbumSortMode): AlbumSummary[] => {
  const sorted = [...albums];
  if (mode === "artist") {
    sorted.sort((a, b) => {
      const cmp = sortKey(a.artist).localeCompare(sortKey(b.artist));
      if (cmp !== 0) return cmp;
      return sortKey(a.name).localeCompare(sortKey(b.name));
    });
  } else {
    sorted.sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name)));
  }
  return sorted;
};

const findCenteredIndex = (
  albums: AlbumSummary[],
  selectedAlbum: string | null,
  playingAlbum: string | undefined | null,
): number => {
  if (selectedAlbum) {
    const idx = albums.findIndex((a) => a.name === selectedAlbum);
    if (idx >= 0) return idx;
  }
  if (playingAlbum) {
    const idx = albums.findIndex((a) => a.name === playingAlbum);
    if (idx >= 0) return idx;
  }
  return 0;
};

export const ArtworkCarousel = ({
  albums,
  selectedAlbum,
  onSelectAlbum,
  onPlayAlbum,
  sortMode = "album",
  onSortModeChange,
}: ArtworkCarouselProps) => {
  const {
    state: { currentTrack },
  } = usePlayback();
  const { artCacheBust } = useArtCache();
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const wheelAccumRef = useRef(0);
  const lastNavRef = useRef(0);

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
  if (Math.abs(centeredIndex - posRef.current) > VISIBLE_RANGE) {
    posRef.current = centeredIndex;
    velRef.current = 0;
  }

  // Damped spring animation — writes directly to DOM, zero React overhead per frame
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
        applyPositions(stageRef.current, centeredIndex);
        return;
      }

      applyPositions(stageRef.current, posRef.current);
      rafRef.current = requestAnimationFrame(step);
    };

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);

    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [centeredIndex]);

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

      {onSortModeChange && (
        <div className="absolute top-2 right-3 z-10 flex gap-0.5 bg-white/5 backdrop-blur-sm rounded-md p-0.5">
          <SortButton active={sortMode === "album"} onClick={() => onSortModeChange("album")} label="Album" />
          <SortButton active={sortMode === "artist"} onClick={() => onSortModeChange("artist")} label="Artist" />
        </div>
      )}

      {/* Carousel stage — rAF directly manipulates children via data-idx */}
      <div
        ref={stageRef}
        className="relative flex-1 min-h-0 w-full flex items-center justify-center"
        style={{ perspective: "1400px", perspectiveOrigin: "50% 40%" }}
      >
        {sortedAlbums.map((album, i) => {
          const intOffset = i - centeredIndex;
          if (Math.abs(intOffset) > RENDER_RANGE) return null;
          const initial = buildItemStyle(i - currentPos);
          return (
            <div
              key={album.folder_path}
              data-idx={i}
              className={`absolute ${intOffset !== 0 && Math.abs(intOffset) <= VISIBLE_RANGE ? "cursor-pointer" : ""}`}
              style={{
                height: "clamp(180px, 75%, 380px)",
                aspectRatio: "1",
                transform: initial.transform,
                opacity: Number(initial.opacity),
                zIndex: Number(initial.zIndex),
                willChange: "transform, opacity",
                transformStyle: "preserve-3d",
                pointerEvents: Math.abs(intOffset) > VISIBLE_RANGE ? "none" : undefined,
              }}
              onClick={
                Math.abs(intOffset) <= VISIBLE_RANGE
                  ? () => {
                      if (intOffset !== 0) onSelectAlbum(album.name);
                    }
                  : undefined
              }
              onDoubleClick={
                Math.abs(intOffset) <= VISIBLE_RANGE
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
          <div className="relative text-white text-sm font-semibold truncate max-w-sm px-6">{centeredAlbum.name}</div>
          <div className="relative text-white/45 text-xs truncate max-w-sm px-6">
            {centeredAlbum.artist || "Unknown Artist"}
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
