import { useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { usePlayback } from "../../../contexts/PlaybackContext";
import { useArtCache } from "../../../contexts/ArtCacheContext";
import type { ArtworkCarouselProps, CarouselItemProps } from "./types";
import type { AlbumSummary } from "../../../types/library";
import type { AlbumSortMode } from "../AlbumGrid/types";

const VISIBLE_RANGE = 2;

// Transform configs per offset from center: [center, +-1, +-2]
// x = translateX % (relative to element width), ry = rotateY deg, z = translateZ px
const TRANSFORMS = [
  { x: 0, ry: 0, z: 0, scale: 1, opacity: 1 },
  { x: 72, ry: 42, z: 180, scale: 0.68, opacity: 0.55 },
  { x: 120, ry: 52, z: 340, scale: 0.5, opacity: 0.25 },
];

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

  const sortedAlbums = useMemo(() => sortAlbums(albums, sortMode), [albums, sortMode]);
  const centeredIndex = findCenteredIndex(sortedAlbums, selectedAlbum, currentTrack?.album);
  const centeredAlbum = sortedAlbums[centeredIndex];

  if (sortedAlbums.length === 0) {
    return (
      <div className="w-full h-full bg-black/90 flex items-center justify-center">
        <span className="text-text-tertiary text-xs">No albums in library</span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black/90 flex flex-col overflow-hidden select-none">
      {onSortModeChange && (
        <div className="absolute top-2 right-3 z-10 flex gap-1">
          <SortButton active={sortMode === "album"} onClick={() => onSortModeChange("album")} label="Album" />
          <SortButton active={sortMode === "artist"} onClick={() => onSortModeChange("artist")} label="Artist" />
        </div>
      )}
      <div
        className="relative flex-1 min-h-0 w-full flex items-center justify-center"
        style={{ perspective: "1200px" }}
      >
        {sortedAlbums.map((album, i) => {
          const offset = i - centeredIndex;
          if (Math.abs(offset) > VISIBLE_RANGE) return null;
          return (
            <CarouselItem
              key={album.folder_path}
              album={album}
              offset={offset}
              onClick={() => {
                if (offset !== 0) onSelectAlbum(album.name);
                else onSelectAlbum(selectedAlbum === album.name ? null : album.name);
              }}
              onDoubleClick={() => {
                if (offset === 0) onPlayAlbum(album.name);
              }}
            />
          );
        })}
      </div>
      {centeredAlbum && (
        <div className="pb-3 pt-1 text-center shrink-0">
          <div className="text-white text-sm font-semibold truncate max-w-md mx-auto px-4">{centeredAlbum.name}</div>
          <div className="text-white/50 text-xs truncate max-w-md mx-auto px-4 mt-0.5">
            {centeredAlbum.artist || "Unknown Artist"}
          </div>
        </div>
      )}
    </div>
  );
};

const CarouselItem = ({ album, offset, onClick, onDoubleClick }: CarouselItemProps) => {
  const { artCacheBust } = useArtCache();
  const [failed, setFailed] = useState(false);
  const absOffset = Math.abs(offset);
  const sign = Math.sign(offset);
  const config = TRANSFORMS[absOffset];

  const artUrl =
    album.folder_path && !failed
      ? convertFileSrc(album.folder_path + "/cover.jpg") + (artCacheBust ? `?v=${artCacheBust}` : "")
      : null;

  return (
    <div
      className={`absolute ${offset !== 0 ? "cursor-pointer" : ""}`}
      style={{
        height: "clamp(200px, 80%, 400px)",
        aspectRatio: "1",
        transform: `translateX(${sign * config.x}%) rotateY(${-sign * config.ry}deg) translateZ(${-config.z}px) scale(${config.scale})`,
        opacity: config.opacity,
        zIndex: VISIBLE_RANGE + 1 - absOffset,
        transition: "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <div
        className={`w-full h-full rounded-lg overflow-hidden ${
          absOffset === 0 ? "shadow-[0_8px_40px_rgba(0,0,0,0.6)] ring-1 ring-white/10" : "shadow-lg"
        }`}
      >
        {artUrl ? (
          <img
            src={artUrl}
            alt={album.name}
            className="w-full h-full object-cover"
            draggable={false}
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="w-full h-full bg-bg-elevated flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="w-1/3 h-1/3 text-text-tertiary/50"
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
    </div>
  );
};

const SortButton = ({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) => (
  <button
    onClick={onClick}
    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
      active ? "bg-white/20 text-white" : "text-white/40 hover:text-white/60"
    }`}
  >
    {label}
  </button>
);
