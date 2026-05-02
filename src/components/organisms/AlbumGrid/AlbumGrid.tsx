import { useRef, useState, useEffect, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AlbumArtwork } from "../../atoms/AlbumArtwork/AlbumArtwork";
import type { AlbumGridProps } from "./types";

const MIN_CELL_WIDTH = 160;
const CELL_HEIGHT = 230;
const GAP = 16;
const PADDING = 16;

export const AlbumGrid = ({ albums, selectedAlbum, onSelectAlbum, onPlayAlbum }: AlbumGridProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lanes, setLanes] = useState(4);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      const available = entry.contentRect.width - PADDING * 2;
      setLanes(Math.max(2, Math.floor((available + GAP) / (MIN_CELL_WIDTH + GAP))));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rowCount = Math.ceil(albums.length / lanes);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => containerRef.current,
    estimateSize: () => CELL_HEIGHT + GAP,
    overscan: 3,
  });

  const handleClick = useCallback(
    (albumName: string) => {
      onSelectAlbum(selectedAlbum === albumName ? null : albumName);
    },
    [selectedAlbum, onSelectAlbum],
  );

  if (albums.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-bg-secondary border border-border rounded-2xl">
        <span className="text-text-tertiary text-xs">No albums</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto overflow-x-hidden bg-bg-secondary border border-border rounded-2xl"
    >
      <div
        className="relative"
        style={{
          height: virtualizer.getTotalSize() + PADDING * 2,
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * lanes;
          const rowAlbums = albums.slice(startIndex, startIndex + lanes);

          return (
            <div
              key={virtualRow.key}
              className="absolute left-0 right-0"
              style={{
                top: virtualRow.start + PADDING,
                height: CELL_HEIGHT,
                display: "grid",
                gridTemplateColumns: `repeat(${lanes}, 1fr)`,
                gap: GAP,
                paddingLeft: PADDING,
                paddingRight: PADDING,
              }}
            >
              {rowAlbums.map((album) => (
                <button
                  key={`${album.artist}-${album.name}`}
                  onClick={() => handleClick(album.name)}
                  onDoubleClick={() => onPlayAlbum?.(album.name)}
                  className={`flex flex-col items-center text-center transition-all rounded-xl p-2 min-w-0 ${
                    selectedAlbum === album.name ? "bg-accent/10 ring-1 ring-accent" : "hover:bg-bg-card/50"
                  }`}
                >
                  <AlbumArtwork folderPath={album.folder_path} size="lg" className="rounded-lg" />
                  <div className="mt-2 w-full min-w-0">
                    <div className="text-[11px] font-medium text-text-primary truncate">{album.name}</div>
                    <div className="text-[10px] text-text-tertiary truncate">{album.artist}</div>
                    <div className="text-[10px] text-text-tertiary/60 mt-0.5">
                      {album.track_count} {album.track_count === 1 ? "track" : "tracks"}
                      {album.year && ` · ${album.year}`}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};
