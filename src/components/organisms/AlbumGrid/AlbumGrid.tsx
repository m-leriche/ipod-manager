import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AlbumArtwork } from "../../atoms/AlbumArtwork/AlbumArtwork";
import { ContextMenu } from "../../molecules/ContextMenu/ContextMenu";
import type { AlbumSummary } from "../../../types/library";
import type { AlbumGridProps, AlbumSortMode } from "./types";

const MIN_CELL_WIDTH = 160;
const CELL_HEIGHT = 230;
const GAP = 16;
const PADDING = 16;

/** Sort key matching the backend: strip "The ", remove non-alphanumeric, lowercase. */
const sortKey = (s: string): string => {
  const trimmed = s.trim();
  const withoutThe = /^the /i.test(trimmed) ? trimmed.slice(4) : trimmed;
  return withoutThe.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
};

export const AlbumGrid = ({
  albums,
  selectedAlbum,
  onSelectAlbum,
  onPlayAlbum,
  onFixAlbumArt,
  onUploadAlbumArt,
  onFixAllAlbumArt,
  isFixingAllArt,
  sortMode = "album",
  onSortModeChange,
}: AlbumGridProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lanes, setLanes] = useState(4);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; album: AlbumSummary } | null>(null);

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

  const sortedAlbums = useMemo(() => {
    const sorted = [...albums];
    if (sortMode === "artist") {
      sorted.sort((a, b) => {
        const cmp = sortKey(a.artist).localeCompare(sortKey(b.artist));
        if (cmp !== 0) return cmp;
        return sortKey(a.name).localeCompare(sortKey(b.name));
      });
    } else {
      sorted.sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name)));
    }
    return sorted;
  }, [albums, sortMode]);

  const rowCount = Math.ceil(sortedAlbums.length / lanes);

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

  const handleDoubleClick = useCallback(
    (albumName: string) => {
      onSelectAlbum(albumName);
      onPlayAlbum?.(albumName);
    },
    [onSelectAlbum, onPlayAlbum],
  );

  const handleSortToggle = useCallback(
    (mode: AlbumSortMode) => {
      onSortModeChange?.(mode);
    },
    [onSortModeChange],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent, album: AlbumSummary) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, album });
  }, []);

  if (albums.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 bg-bg-secondary border border-border rounded-2xl">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="w-8 h-8 text-text-tertiary/30"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V4.5a1.5 1.5 0 00-1.5-1.5H3.75a1.5 1.5 0 00-1.5 1.5v15a1.5 1.5 0 001.5 1.5z"
          />
        </svg>
        <span className="text-text-tertiary text-xs">No albums</span>
        <span className="text-text-tertiary/40 text-[10px]">Albums will appear as you add music</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg-secondary border border-border rounded-2xl overflow-hidden">
      {/* Sort toggle header */}
      <div className="flex items-center gap-1 px-3 py-1 border-b border-border shrink-0">
        <span className="text-[10px] text-text-tertiary mr-1">Sort:</span>
        <SortButton active={sortMode === "album"} onClick={() => handleSortToggle("album")} label="Album" />
        <SortButton active={sortMode === "artist"} onClick={() => handleSortToggle("artist")} label="Artist" />
        <span className="flex-1" />
        <span className="text-[10px] text-text-tertiary tabular-nums">{albums.length} albums</span>
      </div>

      {/* Scrollable grid */}
      <div
        ref={containerRef}
        key={sortedAlbums.length}
        className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 view-enter"
      >
        <div
          className="relative"
          style={{
            height: virtualizer.getTotalSize() + PADDING * 2,
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const startIndex = virtualRow.index * lanes;
            const rowAlbums = sortedAlbums.slice(startIndex, startIndex + lanes);

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
                    onDoubleClick={() => handleDoubleClick(album.name)}
                    onContextMenu={(e) => handleContextMenu(e, album)}
                    className={`flex flex-col items-center text-center transition-all duration-150 rounded-xl p-2 min-w-0 ${
                      selectedAlbum === album.name
                        ? "bg-accent/10 ring-1 ring-accent"
                        : "hover:bg-bg-card/50 hover:scale-[1.03] hover:shadow-lg hover:shadow-black/20"
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

      {contextMenu &&
        createPortal(
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={[
              {
                label: "Play Album",
                onClick: () => {
                  onPlayAlbum?.(contextMenu.album.name);
                  setContextMenu(null);
                },
              },
              { type: "separator" },
              {
                label: "Upload Artwork...",
                onClick: () => {
                  onUploadAlbumArt?.(contextMenu.album);
                  setContextMenu(null);
                },
                disabled: !onUploadAlbumArt,
              },
              {
                label: "Fix Album Artwork",
                onClick: () => {
                  onFixAlbumArt?.(contextMenu.album);
                  setContextMenu(null);
                },
                disabled: !onFixAlbumArt,
              },
              {
                label: "Fix All Album Artwork",
                onClick: () => {
                  onFixAllAlbumArt?.();
                  setContextMenu(null);
                },
                disabled: !onFixAllAlbumArt || isFixingAllArt,
              },
            ]}
            onClose={() => setContextMenu(null)}
          />,
          document.body,
        )}
    </div>
  );
};

const SortButton = ({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) => (
  <button
    onClick={onClick}
    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
      active ? "text-accent bg-accent/10" : "text-text-tertiary hover:text-text-secondary"
    }`}
  >
    {label}
  </button>
);
