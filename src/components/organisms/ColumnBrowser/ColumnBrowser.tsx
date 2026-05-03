import { memo, useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ContextMenu } from "../../molecules/ContextMenu/ContextMenu";
import { useTypeToSelect } from "../../../hooks/useTypeToSelect";
import { useKeyboardNavigation } from "../../../hooks/useKeyboardNavigation";
import { useColumnBrowserWidths } from "./useColumnBrowserWidths";
import type { GenreSummary, ArtistSummary, AlbumSummary } from "../../../types/library";

export interface ColumnContextMenuAction {
  column: "genre" | "artist" | "album";
  value: string;
}

interface ColumnBrowserProps {
  genres: GenreSummary[];
  artists: ArtistSummary[];
  albums: AlbumSummary[];
  selectedGenre: string | null;
  selectedArtist: string | null;
  selectedAlbum: string | null;
  onSelectGenre: (genre: string | null) => void;
  onSelectArtist: (artist: string | null) => void;
  onSelectAlbum: (album: string | null) => void;
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
}

export const ColumnBrowser = memo(function ColumnBrowser({
  genres,
  artists,
  albums,
  selectedGenre,
  selectedArtist,
  selectedAlbum,
  onSelectGenre,
  onSelectArtist,
  onSelectAlbum,
  onPlay,
  onPlayAll,
  onAddAllToQueue,
  onAddAllToPlaylist,
  playlists,
}: ColumnBrowserProps) {
  const { widths, containerRef, onDragStart } = useColumnBrowserWidths();

  const genreItems = useMemo<BrowserItem[]>(
    () => genres.map((g) => ({ label: g.name, count: g.track_count })),
    [genres],
  );
  const artistItems = useMemo<BrowserItem[]>(
    () => artists.map((a) => ({ label: a.name, count: a.track_count })),
    [artists],
  );
  const albumItems = useMemo<BrowserItem[]>(
    () => albums.map((a) => ({ key: `${a.artist}::${a.name}`, label: a.name, count: a.track_count })),
    [albums],
  );

  return (
    <div ref={containerRef} className="flex border-b border-border h-full">
      <BrowserColumn
        title="Genres"
        columnType="genre"
        allLabel={`All Genres (${genres.length})`}
        items={genreItems}
        selected={selectedGenre}
        onSelect={onSelectGenre}
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
        selected={selectedArtist}
        onSelect={onSelectArtist}
        onPlay={onPlay}
        onPlayAll={onPlayAll}
        onAddAllToQueue={onAddAllToQueue}
        onAddAllToPlaylist={onAddAllToPlaylist}
        playlists={playlists}
        widthPercent={`${widths[1] * 100}%`}
        onResizeStart={(e) => onDragStart(1, e)}
      />
      <BrowserColumn
        title="Albums"
        columnType="album"
        allLabel={`All Albums (${albums.length})`}
        items={albumItems}
        selected={selectedAlbum}
        onSelect={onSelectAlbum}
        onPlay={onPlay}
        onPlayAll={onPlayAll}
        onAddAllToQueue={onAddAllToQueue}
        onAddAllToPlaylist={onAddAllToPlaylist}
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
  selected: string | null;
  onSelect: (value: string | null) => void;
  onPlay?: () => void;
  onPlayAll?: (action: ColumnContextMenuAction) => void;
  onAddAllToQueue?: (action: ColumnContextMenuAction) => void;
  onAddAllToPlaylist?: (action: ColumnContextMenuAction, playlistId: number) => void;
  playlists?: { id: number; name: string }[];
  widthPercent: string;
  onResizeStart?: (e: React.MouseEvent) => void;
  isLast?: boolean;
}

const ITEM_HEIGHT = 27;
const ALL_BTN_HEIGHT = 27;

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
}: BrowserColumnProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const savedScrollRef = useRef(0);
  const prevSelectedRef = useRef(selected);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; value: string } | null>(null);

  // Save scroll position when making a selection, restore when clearing it
  useEffect(() => {
    const prev = prevSelectedRef.current;
    prevSelectedRef.current = selected;
    if (prev === null && selected !== null) {
      // Selecting an item — save current scroll position
      savedScrollRef.current = scrollRef.current?.scrollTop ?? 0;
    } else if (prev !== null && selected === null) {
      // Returning to "All" — restore saved position
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: savedScrollRef.current });
      });
    }
  }, [selected]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 10,
    scrollMargin: ALL_BTN_HEIGHT,
  });

  const labels = useMemo(() => items.map((item) => item.label), [items]);

  // ── Keyboard navigation ──────────────────────────────────────

  const selectedIndex = useMemo(() => {
    if (selected === null) return -1;
    return items.findIndex((item) => item.label === selected);
  }, [items, selected]);

  const handleNavNavigate = useCallback(
    (index: number) => {
      if (index === -1) {
        onSelect(null);
        scrollRef.current?.scrollTo({ top: 0 });
      } else {
        onSelect(items[index]?.label ?? null);
      }
    },
    [items, onSelect],
  );

  const handleNavActivate = useCallback(() => {
    onPlay?.();
  }, [onPlay]);

  const handleNavDeselect = useCallback(() => {
    onSelect(null);
    scrollRef.current?.scrollTo({ top: 0 });
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
      onSelect(items[index].label);
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
    onSelect(null);
    focusedIndexRef.current = -1;
  }, [onSelect, focusedIndexRef]);

  const handleItemClick = useCallback(
    (index: number) => {
      onSelect(items[index].label);
      focusedIndexRef.current = index;
    },
    [items, onSelect, focusedIndexRef],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent, value: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, value });
  }, []);

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
    ];
  }, [contextMenu, columnType, onPlayAll, onAddAllToQueue, onAddAllToPlaylist, playlists]);

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
            selected === null ? "bg-accent text-white" : "text-text-primary hover:bg-bg-hover/50"
          }`}
        >
          {allLabel}
        </button>

        {/* Virtualized items */}
        <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
          {virtualItems.map((virtualItem) => {
            const item = items[virtualItem.index];
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
                onClick={() => handleItemClick(virtualItem.index)}
                onDoubleClick={onPlay}
                onContextMenu={(e) => handleContextMenu(e, item.label)}
                className={`text-left px-3 py-[5px] text-[11px] truncate transition-colors ${
                  selected === item.label ? "bg-accent text-white" : "text-text-primary hover:bg-bg-hover/50"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
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
