import { memo, useRef, useMemo, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTypeToSelect } from "../../../hooks/useTypeToSelect";
import { useKeyboardNavigation } from "../../../hooks/useKeyboardNavigation";
import type { GenreSummary, ArtistSummary, AlbumSummary } from "../../../types/library";

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
}: ColumnBrowserProps) {
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
    <div className="flex border-b border-border shrink-0" style={{ height: "35%" }}>
      <BrowserColumn
        title="Genres"
        allLabel={`All Genres (${genres.length})`}
        items={genreItems}
        selected={selectedGenre}
        onSelect={onSelectGenre}
        onPlay={onPlay}
      />
      <BrowserColumn
        title="Artists"
        allLabel={`All Artists (${artists.length})`}
        items={artistItems}
        selected={selectedArtist}
        onSelect={onSelectArtist}
        onPlay={onPlay}
      />
      <BrowserColumn
        title="Albums"
        allLabel={`All Albums (${albums.length})`}
        items={albumItems}
        selected={selectedAlbum}
        onSelect={onSelectAlbum}
        onPlay={onPlay}
        isLast
      />
    </div>
  );
});

interface BrowserColumnProps {
  title: string;
  allLabel: string;
  items: BrowserItem[];
  selected: string | null;
  onSelect: (value: string | null) => void;
  onPlay?: () => void;
  isLast?: boolean;
}

const ITEM_HEIGHT = 27;
const ALL_BTN_HEIGHT = 27;

const BrowserColumn = memo(function BrowserColumn({
  title,
  allLabel,
  items,
  selected,
  onSelect,
  onPlay,
  isLast,
}: BrowserColumnProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      className={`flex-1 min-w-0 flex flex-col outline-none ${isLast ? "" : "border-r border-border"}`}
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
    </div>
  );
});
