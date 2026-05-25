import { memo, useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AlbumArtwork } from "../../atoms/AlbumArtwork/AlbumArtwork";
import { ContextMenu } from "../../molecules/ContextMenu/ContextMenu";
import { useTypeToSelect } from "../../../hooks/useTypeToSelect";
import { useKeyboardNavigation } from "../../../hooks/useKeyboardNavigation";
import { useColumnBrowserWidths } from "./useColumnBrowserWidths";
import { useNewReleases } from "../../../contexts/NewReleasesContext";
import type { GenreSummary, ArtistSummary, AlbumSummary } from "../../../types/library";

export interface ColumnContextMenuAction {
  column: "genre" | "artist" | "album";
  value: string;
}

interface ColumnBrowserProps {
  genres: GenreSummary[];
  artists: ArtistSummary[];
  albums: AlbumSummary[];
  selectedGenres: Set<string>;
  selectedArtists: Set<string>;
  selectedAlbums: Set<string>;
  onSelectGenres: (genres: Set<string>) => void;
  onSelectArtists: (artists: Set<string>) => void;
  onSelectAlbums: (albums: Set<string>) => void;
  onPlay?: () => void;
  onPlayAll?: (action: ColumnContextMenuAction) => void;
  onAddAllToQueue?: (action: ColumnContextMenuAction) => void;
  onAddAllToPlaylist?: (action: ColumnContextMenuAction, playlistId: number) => void;
  playlists?: { id: number; name: string }[];
}

interface BrowserItem {
  key?: string;
  label: string;
  count: number;
  folderPath?: string;
}

export const ColumnBrowser = memo(function ColumnBrowser({
  genres,
  artists,
  albums,
  selectedGenres,
  selectedArtists,
  selectedAlbums,
  onSelectGenres,
  onSelectArtists,
  onSelectAlbums,
  onPlay,
  onPlayAll,
  onAddAllToQueue,
  onAddAllToPlaylist,
  playlists,
}: ColumnBrowserProps) {
  const { widths, containerRef, onDragStart } = useColumnBrowserWidths();
  const { watchArtist, unwatchArtist, isWatched, hasNewReleases } = useNewReleases();

  const genreItems = useMemo<BrowserItem[]>(
    () => genres.map((g) => ({ label: g.name, count: g.track_count })),
    [genres],
  );
  const artistItems = useMemo<BrowserItem[]>(
    () => artists.map((a) => ({ label: a.name, count: a.track_count })),
    [artists],
  );
  const albumItems = useMemo<BrowserItem[]>(
    () =>
      albums.map((a) => ({
        key: `${a.artist}::${a.name}`,
        label: a.name,
        count: a.track_count,
        folderPath: a.folder_path,
      })),
    [albums],
  );

  return (
    <div ref={containerRef} className="flex border-b border-border h-full bg-bg-primary overflow-hidden">
      <BrowserColumn
        title="Genres"
        columnType="genre"
        allLabel={`All Genres (${genres.length})`}
        items={genreItems}
        selected={selectedGenres}
        onSelect={onSelectGenres}
        onPlay={onPlay}
        onPlayAll={onPlayAll}
        onAddAllToQueue={onAddAllToQueue}
        onAddAllToPlaylist={onAddAllToPlaylist}
        playlists={playlists}
        widthPercent={`${widths[0] * 100}%`}
        onResizeStart={(e) => onDragStart(0, e)}
      />
      <BrowserColumn
        title="Artists"
        columnType="artist"
        allLabel={`All Artists (${artists.length})`}
        items={artistItems}
        selected={selectedArtists}
        onSelect={onSelectArtists}
        onPlay={onPlay}
        onPlayAll={onPlayAll}
        onAddAllToQueue={onAddAllToQueue}
        onAddAllToPlaylist={onAddAllToPlaylist}
        playlists={playlists}
        widthPercent={`${widths[1] * 100}%`}
        onResizeStart={(e) => onDragStart(1, e)}
        onWatchArtist={watchArtist}
        onUnwatchArtist={unwatchArtist}
        isItemWatched={isWatched}
        hasItemNewReleases={hasNewReleases}
      />
      <BrowserColumn
        title="Albums"
        columnType="album"
        allLabel={`All Albums (${albums.length})`}
        items={albumItems}
        selected={selectedAlbums}
        onSelect={onSelectAlbums}
        onPlay={onPlay}
        onPlayAll={onPlayAll}
        onAddAllToQueue={onAddAllToQueue}
        onAddAllToPlaylist={onAddAllToPlaylist}
        showArt
        playlists={playlists}
        widthPercent={`${widths[2] * 100}%`}
        isLast
      />
    </div>
  );
});

interface BrowserColumnProps {
  title: string;
  columnType: "genre" | "artist" | "album";
  allLabel: string;
  items: BrowserItem[];
  selected: Set<string>;
  onSelect: (value: Set<string>) => void;
  onPlay?: () => void;
  onPlayAll?: (action: ColumnContextMenuAction) => void;
  onAddAllToQueue?: (action: ColumnContextMenuAction) => void;
  onAddAllToPlaylist?: (action: ColumnContextMenuAction, playlistId: number) => void;
  playlists?: { id: number; name: string }[];
  widthPercent: string;
  onResizeStart?: (e: React.MouseEvent) => void;
  isLast?: boolean;
  showArt?: boolean;
  onWatchArtist?: (name: string) => void;
  onUnwatchArtist?: (name: string) => void;
  isItemWatched?: (name: string) => boolean;
  hasItemNewReleases?: (name: string) => boolean;
}

const ITEM_HEIGHT = 27;
const ALL_BTN_HEIGHT = 27;

const ART_ITEM_HEIGHT = 32;

const BrowserColumn = memo(function BrowserColumn({
  title,
  columnType,
  allLabel,
  items,
  selected,
  onSelect,
  onPlay,
  onPlayAll,
  onAddAllToQueue,
  onAddAllToPlaylist,
  playlists,
  widthPercent,
  onResizeStart,
  isLast,
  showArt,
  onWatchArtist,
  onUnwatchArtist,
  isItemWatched,
  hasItemNewReleases,
}: BrowserColumnProps) {
  const itemHeight = showArt ? ART_ITEM_HEIGHT : ITEM_HEIGHT;
  const scrollRef = useRef<HTMLDivElement>(null);
  const savedScrollRef = useRef(0);
  const prevSelectedSizeRef = useRef(selected.size);
  const lastClickedIndexRef = useRef<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    value: string;
    targetValues: string[];
  } | null>(null);

  // Save scroll position when making a selection, restore when clearing it
  useEffect(() => {
    const prevSize = prevSelectedSizeRef.current;
    prevSelectedSizeRef.current = selected.size;
    if (prevSize === 0 && selected.size > 0) {
      savedScrollRef.current = scrollRef.current?.scrollTop ?? 0;
    } else if (prevSize > 0 && selected.size === 0) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: savedScrollRef.current });
      });
    }
  }, [selected]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => itemHeight,
    overscan: 10,
    scrollMargin: ALL_BTN_HEIGHT,
  });

  const labels = useMemo(() => items.map((item) => item.label), [items]);

  // ── Keyboard navigation ──────────────────────────────────────

  const selectedIndex = useMemo(() => {
    if (selected.size === 0) return -1;
    // Use last-clicked index for keyboard navigation anchor
    return items.findIndex((item) => selected.has(item.label));
  }, [items, selected]);

  const handleNavNavigate = useCallback(
    (index: number) => {
      if (index === -1) {
        onSelect(new Set());
        scrollRef.current?.scrollTo({ top: 0 });
      } else {
        onSelect(new Set([items[index]?.label].filter(Boolean)));
        lastClickedIndexRef.current = index;
      }
    },
    [items, onSelect],
  );

  const handleNavActivate = useCallback(() => {
    onPlay?.();
  }, [onPlay]);

  const handleNavDeselect = useCallback(() => {
    onSelect(new Set());
    scrollRef.current?.scrollTo({ top: 0 });
    lastClickedIndexRef.current = null;
  }, [onSelect]);

  const { onKeyDown: handleNavKeyDown, focusedIndexRef } = useKeyboardNavigation({
    count: items.length,
    onNavigate: handleNavNavigate,
    onActivate: handleNavActivate,
    onDeselect: handleNavDeselect,
    virtualizer,
    minIndex: -1,
    selectedIndex,
  });

  // ── Type-to-select ───────────────────────────────────────────

  const handleTypeToSelectMatch = useCallback(
    (index: number) => {
      onSelect(new Set([items[index].label]));
      lastClickedIndexRef.current = index;
      focusedIndexRef.current = index;
      virtualizer.scrollToIndex(index, { align: "center" });
    },
    [items, onSelect, virtualizer, focusedIndexRef],
  );

  const { onKeyDown: handleTypeKeyDown } = useTypeToSelect({ labels, onMatch: handleTypeToSelectMatch });

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      handleNavKeyDown(e);
      handleTypeKeyDown(e);
    },
    [handleNavKeyDown, handleTypeKeyDown],
  );

  // ── Click handlers ───────────────────────────────────────────

  const handleAllClick = useCallback(() => {
    onSelect(new Set());
    focusedIndexRef.current = -1;
    lastClickedIndexRef.current = null;
  }, [onSelect, focusedIndexRef]);

  const handleItemClick = useCallback(
    (index: number, e: React.MouseEvent) => {
      const label = items[index].label;
      const isMeta = e.metaKey || e.ctrlKey;
      const isShift = e.shiftKey;

      if (isShift && lastClickedIndexRef.current !== null) {
        // Shift+click: range select from last clicked to current
        const start = Math.min(lastClickedIndexRef.current, index);
        const end = Math.max(lastClickedIndexRef.current, index);
        const next = new Set(selected);
        for (let i = start; i <= end; i++) {
          next.add(items[i].label);
        }
        onSelect(next);
      } else if (isMeta) {
        // Cmd/Ctrl+click: toggle individual item
        const next = new Set(selected);
        if (next.has(label)) {
          next.delete(label);
        } else {
          next.add(label);
        }
        onSelect(next);
        lastClickedIndexRef.current = index;
      } else {
        // Plain click: single select (click "All" to deselect)
        onSelect(new Set([label]));
        lastClickedIndexRef.current = index;
      }
      focusedIndexRef.current = index;
    },
    [items, selected, onSelect, focusedIndexRef],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, value: string, index: number) => {
      e.preventDefault();
      let targetValues: string[];
      if (selected.has(value)) {
        targetValues = Array.from(selected);
      } else {
        onSelect(new Set([value]));
        lastClickedIndexRef.current = index;
        focusedIndexRef.current = index;
        targetValues = [value];
      }
      setContextMenu({ x: e.clientX, y: e.clientY, value, targetValues });
    },
    [selected, onSelect, focusedIndexRef],
  );

  const contextMenuItems = useMemo(() => {
    if (!contextMenu) return [];
    const action: ColumnContextMenuAction = { column: columnType, value: contextMenu.value };
    return [
      ...(onPlayAll
        ? [
            {
              label: `Play All`,
              onClick: () => {
                onPlayAll(action);
                setContextMenu(null);
              },
            },
          ]
        : []),
      ...(onAddAllToQueue
        ? [
            {
              label: `Add All to Queue`,
              onClick: () => {
                onAddAllToQueue(action);
                setContextMenu(null);
              },
            },
          ]
        : []),
      ...(playlists && playlists.length > 0 && onAddAllToPlaylist
        ? [
            {
              type: "submenu" as const,
              label: "Add All to Playlist",
              children: playlists.map((p) => ({
                label: p.name,
                onClick: () => {
                  onAddAllToPlaylist(action, p.id);
                  setContextMenu(null);
                },
              })),
            },
          ]
        : []),
      ...(onWatchArtist && onUnwatchArtist && isItemWatched
        ? (() => {
            const values = contextMenu.targetValues;
            const allWatched = values.every((v) => isItemWatched(v));
            const label =
              values.length > 1
                ? allWatched
                  ? `Stop Watching ${values.length} Artists`
                  : `Watch ${values.length} Artists for New Releases`
                : allWatched
                  ? "Stop Watching Releases"
                  : "Watch for New Releases";
            return [
              {
                label,
                onClick: () => {
                  values.forEach((v) => {
                    if (allWatched) {
                      onUnwatchArtist(v);
                    } else if (!isItemWatched(v)) {
                      onWatchArtist(v);
                    }
                  });
                  setContextMenu(null);
                },
              },
            ];
          })()
        : []),
    ];
  }, [
    contextMenu,
    columnType,
    onPlayAll,
    onAddAllToQueue,
    onAddAllToPlaylist,
    playlists,
    onWatchArtist,
    onUnwatchArtist,
    isItemWatched,
  ]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      className={`min-w-0 flex flex-col outline-none relative ${isLast ? "" : "border-r border-border"}`}
      style={{ width: widthPercent, flex: "none" }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="px-3 py-1.5 border-b border-border bg-bg-secondary shrink-0">
        <span className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary">{title}</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {/* "All" option — always rendered, outside virtualizer */}
        <button
          onClick={handleAllClick}
          onDoubleClick={onPlay}
          className={`w-full text-left px-3 py-[5px] text-[11px] transition-colors ${
            selected.size === 0 ? "bg-accent text-white" : "text-text-primary hover:bg-bg-hover/50"
          }`}
        >
          {allLabel}
        </button>

        {/* Virtualized items */}
        <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
          {virtualItems.map((virtualItem) => {
            const item = items[virtualItem.index];
            const isSelected = selected.has(item.label);
            return (
              <button
                key={item.key ?? item.label}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: virtualItem.size,
                  transform: `translateY(${virtualItem.start - virtualizer.options.scrollMargin}px)`,
                }}
                onClick={(e) => handleItemClick(virtualItem.index, e)}
                onDoubleClick={onPlay}
                onContextMenu={(e) => handleContextMenu(e, item.label, virtualItem.index)}
                className={`text-left px-3 text-[11px] truncate transition-colors flex items-center gap-2 ${
                  showArt ? "py-[3px]" : "py-[5px]"
                } ${isSelected ? "bg-accent text-white" : "text-text-primary hover:bg-bg-hover/50"}`}
              >
                {showArt && item.folderPath && (
                  <AlbumArtwork folderPath={item.folderPath} size="sm" className="!w-6 !h-6 !rounded" />
                )}
                <span className="truncate">{item.label}</span>
                {isItemWatched?.(item.label) && (
                  <span
                    className={`w-1 h-1 rounded-full shrink-0 ${
                      hasItemNewReleases?.(item.label) ? "bg-accent" : "bg-text-tertiary/30"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {contextMenu &&
        createPortal(
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextMenuItems}
            onClose={() => setContextMenu(null)}
          />,
          document.body,
        )}

      {onResizeStart && (
        <div
          onMouseDown={onResizeStart}
          className="absolute top-0 -right-[4px] w-[9px] h-full cursor-col-resize group/handle z-20"
        >
          <div className="absolute left-1 top-1 bottom-1 w-px bg-transparent group-hover/handle:bg-text-tertiary group-active/handle:bg-accent transition-colors" />
        </div>
      )}
    </div>
  );
});
