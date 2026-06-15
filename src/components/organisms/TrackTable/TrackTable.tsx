import { memo, useState, useCallback, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";
import { ContextMenu } from "../../molecules/ContextMenu/ContextMenu";
import { ConfirmDialog } from "../../atoms/ConfirmDialog/ConfirmDialog";
import { usePlayback } from "../../../contexts/PlaybackContext";
import { usePlaylist } from "../../../contexts/PlaylistContext";
import { useToast } from "../../../contexts/ToastContext";
import { useTypeToSelect } from "../../../hooks/useTypeToSelect";
import { useKeyboardNavigation } from "../../../hooks/useKeyboardNavigation";
import { useColumnResize } from "./useColumnResize";
import { useColumnOrder } from "./useColumnOrder";
import { useTrackContextMenu } from "./useTrackContextMenu";
import { TrackRow } from "./TrackRow";
import { getAlbumTracks } from "./helpers";
import { COLUMNS, ROW_HEIGHT, LOAD_AHEAD_ROWS, SORT_KEY_TO_TRACK_FIELD } from "./constants";
import type { LibraryTrack } from "../../../types/library";
import type { ContextMenuState } from "./types";

// Module-level drag payload so drop targets can read the tracks
let dragPayload: LibraryTrack[] = [];
export const getDragPayload = (): LibraryTrack[] => dragPayload;

interface TrackTableProps {
  /** Sparse in paginated library view — unloaded rows are undefined. */
  tracks: (LibraryTrack | undefined)[];
  totalTrackCount?: number;
  onLoadMore?: (index: number) => void;
  sortBy: string;
  sortDirection: "asc" | "desc";
  onSort: (key: string) => void;
  onTrackSelect?: (track: LibraryTrack) => void;
  onSelectionChange?: (selectedIds: Set<number>) => void;
  onTracksDeleted?: () => void;
  onFlagTracks?: (trackIds: number[], flagged: boolean) => void;
  onRateTracks?: (trackIds: number[], rating: number) => void;
  onRepairAlbumArt?: (tracks: LibraryTrack[]) => void;
  onRepairAllAlbumArt?: () => void;
  isRepairingAllArt?: boolean;
  onFetchLyrics?: (tracks: LibraryTrack[]) => void;
  onRemoveLyrics?: (tracks: LibraryTrack[]) => void;
  onFetchAllLyrics?: () => void;
  isFetchingAllLyrics?: boolean;
  onFetchGenres?: (tracks: LibraryTrack[]) => void;
  onFetchAllGenres?: () => void;
  isFetchingGenres?: boolean;
  onRepairMetadata?: (tracks: LibraryTrack[]) => void;
  activePlaylistId?: number | null;
}

export const TrackTable = memo(function TrackTable({
  tracks,
  totalTrackCount,
  onLoadMore,
  sortBy,
  sortDirection,
  onSort,
  onTrackSelect,
  onSelectionChange,
  onTracksDeleted,
  onFlagTracks,
  onRateTracks,
  onRepairAlbumArt,
  onRepairAllAlbumArt,
  isRepairingAllArt,
  onFetchLyrics,
  onRemoveLyrics,
  onFetchAllLyrics,
  isFetchingAllLyrics,
  onFetchGenres,
  onFetchAllGenres,
  isFetchingGenres,
  onRepairMetadata,
  activePlaylistId,
}: TrackTableProps) {
  const { state, playTrack } = usePlayback();
  const { moveTrack } = usePlaylist();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number[] | null>(null);
  // Playlist drag-reorder: the gap (0..rowCount) where the dragged row will land.
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const { orderedColumns, dragIndex, dragOverIndex, setHeaderRef, onReorderStart } = useColumnOrder(COLUMNS);
  const orderedDefs = useMemo(() => orderedColumns.map((c) => c.def), [orderedColumns]);
  const { widths, onResizeStart } = useColumnResize(orderedDefs);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  // Teardown for the active playlist-reorder drag (removes its window listeners).
  const reorderCleanupRef = useRef<(() => void) | null>(null);

  // Ref for selected so handleClick doesn't depend on selected state
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useEffect(() => {
    onSelectionChange?.(selected);
  }, [selected, onSelectionChange]);

  const totalWidth = useMemo(() => widths.reduce((a, b) => a + b, 0), [widths]);

  const rowCount = totalTrackCount ?? tracks.length;
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  // Tracks loaded so far, dense — for consumers that need a plain list
  // (album grouping, context menu, drag payload). Index-based logic must
  // use the sparse `tracks` so positions stay aligned with the virtualizer.
  const loadedTracks = useMemo(() => tracks.filter((t): t is LibraryTrack => t !== undefined), [tracks]);

  // Request every missing row in (and just past) the viewport. The hook
  // behind onLoadMore page-aligns and dedupes, so jumping the scrollbar
  // deep into the list fetches that page directly instead of chain-loading
  // everything before it.
  const virtualItems = virtualizer.getVirtualItems();
  useEffect(() => {
    if (!onLoadMore || !totalTrackCount) return;
    if (virtualItems.length === 0) return;
    const first = virtualItems[0].index;
    const last = Math.min(virtualItems[virtualItems.length - 1].index + LOAD_AHEAD_ROWS, totalTrackCount - 1);
    for (let i = first; i <= last; i++) {
      if (!tracks[i]) onLoadMore(i);
    }
  }, [virtualItems, tracks, totalTrackCount, onLoadMore]);

  // ── Keyboard navigation ──────────────────────────────────────

  const lastClickedIndexRef = useRef(0);
  const searchField = SORT_KEY_TO_TRACK_FIELD[sortBy] ?? "title";
  const searchLabels = useMemo(
    () => tracks.map((t) => (t ? String(t[searchField] ?? t.title ?? t.file_name ?? "") : "")),
    [tracks, searchField],
  );

  const handleKeyboardNavigate = useCallback(
    (index: number, mode: "single" | "range") => {
      const track = tracks[index];
      if (!track) return;
      if (mode === "single") {
        setSelected(new Set([track.id]));
        lastClickedIndexRef.current = index;
      } else {
        const anchor = lastClickedIndexRef.current;
        const [start, end] = [Math.min(anchor, index), Math.max(anchor, index)];
        const rangeIds = new Set(
          tracks
            .slice(start, end + 1)
            .filter((t): t is LibraryTrack => t !== undefined)
            .map((t) => t.id),
        );
        setSelected(rangeIds);
      }
      onTrackSelect?.(track);
    },
    [tracks, onTrackSelect],
  );

  const handleKeyboardActivate = useCallback(
    (index: number) => {
      const track = tracks[index];
      if (track) playTrack(track, getAlbumTracks(track, loadedTracks));
    },
    [tracks, loadedTracks, playTrack],
  );

  const { onKeyDown: handleNavKeyDown, focusedIndexRef } = useKeyboardNavigation({
    count: tracks.length,
    onNavigate: handleKeyboardNavigate,
    onActivate: handleKeyboardActivate,
    onDeselect: useCallback(() => setSelected(new Set()), []),
    virtualizer,
    selectedIndex: lastClickedIndexRef.current,
  });

  const handleTypeToSelectMatch = useCallback(
    (index: number) => {
      const track = tracks[index];
      if (!track) return;
      setSelected(new Set([track.id]));
      lastClickedIndexRef.current = index;
      focusedIndexRef.current = index;
      onTrackSelect?.(track);
      virtualizer.scrollToIndex(index, { align: "center" });
    },
    [tracks, onTrackSelect, virtualizer, focusedIndexRef],
  );

  const { onKeyDown: handleTypeToSelectKeyDown } = useTypeToSelect({
    labels: searchLabels,
    onMatch: handleTypeToSelectMatch,
  });

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      handleNavKeyDown(e);
      handleTypeToSelectKeyDown(e);
    },
    [handleNavKeyDown, handleTypeToSelectKeyDown],
  );

  // ── Click / selection handlers ────────────────────────────────

  const handleClick = useCallback(
    (e: React.MouseEvent, track: LibraryTrack) => {
      const sel = selectedRef.current;
      const clickedIndex = tracks.findIndex((t) => t?.id === track.id);
      if (e.metaKey || e.ctrlKey) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(track.id)) next.delete(track.id);
          else next.add(track.id);
          return next;
        });
      } else if (e.shiftKey && sel.size > 0) {
        const lastIdx = lastClickedIndexRef.current;
        const currentIdx = clickedIndex;
        const [start, end] = [Math.min(lastIdx, currentIdx), Math.max(lastIdx, currentIdx)];
        const range = tracks
          .slice(start, end + 1)
          .filter((t): t is LibraryTrack => t !== undefined)
          .map((t) => t.id);
        setSelected((prev) => new Set([...prev, ...range]));
      } else {
        setSelected(new Set([track.id]));
      }
      if (clickedIndex >= 0) {
        lastClickedIndexRef.current = clickedIndex;
        focusedIndexRef.current = clickedIndex;
      }
      onTrackSelect?.(track);
    },
    [tracks, onTrackSelect, focusedIndexRef],
  );

  const handleDoubleClick = useCallback(
    (track: LibraryTrack) => {
      const contextTracks = activePlaylistId != null ? loadedTracks : getAlbumTracks(track, loadedTracks);
      playTrack(track, contextTracks);
    },
    [playTrack, loadedTracks, activePlaylistId],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent, track: LibraryTrack) => {
    e.preventDefault();
    if (!selectedRef.current.has(track.id)) {
      setSelected(new Set([track.id]));
    }
    setContextMenu({ x: e.clientX, y: e.clientY, track });
  }, []);

  // ── Context menu items ────────────────────────────────────────

  const contextMenuItems = useTrackContextMenu({
    tracks: loadedTracks,
    selected,
    contextMenu,
    activePlaylistId,
    onFlagTracks,
    onRateTracks,
    onRepairAlbumArt,
    onRepairAllAlbumArt,
    isRepairingAllArt,
    onFetchLyrics,
    onRemoveLyrics,
    onFetchAllLyrics,
    isFetchingAllLyrics,
    onFetchGenres,
    onFetchAllGenres,
    isFetchingGenres,
    onRepairMetadata,
    onClose: useCallback(() => setContextMenu(null), []),
    onDeleteRequest: useCallback((ids: number[]) => setDeleteConfirm(ids), []),
  });

  // ── Playlist drag-to-reorder (pointer events) ─────────────────
  //
  // We can't use HTML5 drag-and-drop here: the Tauri webview hijacks native
  // drags for OS file-drop (showing the import overlay and swallowing the
  // drop). Pointer events sidestep that entirely.

  const isPlaylistView = activePlaylistId != null;

  // The insertion gap (0..rowCount) the cursor is over: top half of a row =
  // before it, bottom half = after.
  const computeGap = useCallback((clientY: number): number | null => {
    const container = scrollRef.current;
    if (!container) return null;
    const rows = Array.from(container.querySelectorAll<HTMLElement>("tbody tr[data-index]"));
    if (rows.length === 0) return null;
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      if (clientY >= rect.top && clientY < rect.bottom) {
        const idx = parseInt(row.dataset.index!, 10);
        return clientY < rect.top + rect.height / 2 ? idx : idx + 1;
      }
    }
    // Outside any rendered row: clamp to the first/last gap.
    if (clientY < rows[0].getBoundingClientRect().top) return parseInt(rows[0].dataset.index!, 10);
    return parseInt(rows[rows.length - 1].dataset.index!, 10) + 1;
  }, []);

  const handleReorderPointerDown = useCallback(
    (e: React.PointerEvent, index: number) => {
      if (!isPlaylistView || e.button !== 0) return;
      // If a previous drag never received its pointerup (e.g. the button was
      // released outside the window), its window listeners would still be
      // live and the next click would fire a stale move from the wrong row.
      // Tear any such ghost drag down before starting a new one.
      reorderCleanupRef.current?.();

      const startY = e.clientY;
      const state = { from: index, active: false };

      const cleanup = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", cleanup);
        reorderCleanupRef.current = null;
        setDropIndex(null);
      };

      const onMove = (ev: PointerEvent) => {
        // No button held means the pointerup never reached us — abort so a
        // later stray click can't trigger a move from this stale source row.
        if (ev.buttons === 0) {
          cleanup();
          return;
        }
        if (!state.active) {
          if (Math.abs(ev.clientY - startY) < 5) return; // ignore tiny moves (a click)
          state.active = true;
        }
        // Auto-scroll near the top/bottom edge of a long playlist.
        const el = scrollRef.current;
        if (el) {
          const rect = el.getBoundingClientRect();
          const EDGE = 40;
          if (ev.clientY < rect.top + EDGE) el.scrollTop -= 10;
          else if (ev.clientY > rect.bottom - EDGE) el.scrollTop += 10;
        }
        setDropIndex(computeGap(ev.clientY));
      };

      const onUp = (ev: PointerEvent) => {
        const wasActive = state.active;
        cleanup();
        if (!wasActive || activePlaylistId == null) return;
        const gap = computeGap(ev.clientY);
        if (gap === null) return;
        // Dropping into a gap below the dragged row shifts the target down by
        // one once the row itself is removed.
        const to = state.from < gap ? gap - 1 : gap;
        if (to !== state.from) moveTrack(activePlaylistId, state.from, to);
      };

      reorderCleanupRef.current = cleanup;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", cleanup);
    },
    [isPlaylistView, activePlaylistId, moveTrack, computeGap],
  );

  // Tear down a drag in flight if the table unmounts mid-reorder.
  useEffect(() => () => reorderCleanupRef.current?.(), []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm) return;
    try {
      await invoke("delete_library_tracks", { trackIds: deleteConfirm });
      setSelected(new Set());
      onTracksDeleted?.();
    } catch (e) {
      toast.error(`Failed to delete tracks: ${e}`);
    }
    setDeleteConfirm(null);
  }, [deleteConfirm, onTracksDeleted, toast]);

  // ── Render ────────────────────────────────────────────────────

  const currentTrackId = state.currentTrack?.id ?? null;
  const isActivePlaying = state.isPlaying;
  const paddingTop = virtualItems[0]?.start ?? 0;
  const paddingBottom =
    virtualItems.length > 0 ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col view-enter">
      {/* Header — lives OUTSIDE the scroll container so body content
           can never bleed through it regardless of compositor behavior */}
      <div
        ref={headerScrollRef}
        className="shrink-0 overflow-hidden bg-bg-primary"
        style={{ boxShadow: "0 1px 0 0 var(--color-border)" }}
      >
        <div className="flex" style={{ width: totalWidth }}>
          {orderedColumns.map((col, i) => {
            const isActive = col.sortKey === sortBy;
            const isDragging = dragIndex === i;
            const isDragOverCol = dragOverIndex === i && dragIndex !== i;
            return (
              <div
                key={col.key}
                role="columnheader"
                ref={(el) => setHeaderRef(i, el)}
                onMouseDown={(e) => onReorderStart(i, e)}
                onClick={() => onSort(col.sortKey)}
                style={{ width: widths[i] }}
                className={`relative shrink-0 px-3 py-2 text-[10px] font-medium uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-text-primary ${
                  isActive ? "text-text-primary" : "text-text-tertiary"
                } ${col.align === "right" ? "text-right" : "text-left"} ${
                  isDragging ? "opacity-40" : ""
                } ${isDragOverCol ? "!border-l-2 !border-l-accent" : ""}`}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {isActive && <span className="text-[8px]">{sortDirection === "asc" ? "\u25B2" : "\u25BC"}</span>}
                </span>
                {i < orderedColumns.length - 1 && (
                  <div
                    onMouseDown={(e) => onResizeStart(i, e)}
                    className="absolute top-0 -right-[4px] w-[9px] h-full cursor-col-resize group/handle z-20"
                  >
                    <div className="absolute left-1 top-1 bottom-1 w-px bg-border group-hover/handle:bg-text-tertiary group-active/handle:bg-accent transition-colors" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Scrollable body */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-auto outline-none bg-bg-primary"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onScroll={() => {
          if (headerScrollRef.current && scrollRef.current) {
            headerScrollRef.current.scrollLeft = scrollRef.current.scrollLeft;
          }
        }}
        onDragStartCapture={() => {
          dragPayload = selected.size > 0 ? loadedTracks.filter((t) => selected.has(t.id)) : [];
        }}
      >
        <table className="table-fixed border-separate" style={{ width: totalWidth, borderSpacing: 0 }}>
          <colgroup>
            {orderedColumns.map((col, i) => (
              <col key={col.key} style={{ width: widths[i] }} />
            ))}
          </colgroup>
          <tbody>
            {paddingTop > 0 && (
              <tr>
                <td style={{ height: paddingTop, padding: 0 }} colSpan={orderedColumns.length} />
              </tr>
            )}
            {virtualItems.map((virtualRow) => {
              const track = tracks[virtualRow.index];
              if (!track) {
                return (
                  <tr key={`skeleton-${virtualRow.index}`} data-index={virtualRow.index} style={{ height: ROW_HEIGHT }}>
                    <td colSpan={orderedColumns.length} className="px-3">
                      <div className="h-3 w-2/3 rounded bg-bg-card animate-pulse" />
                    </td>
                  </tr>
                );
              }
              return (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={virtualRow.index}
                  columns={orderedColumns}
                  isCurrentTrack={currentTrackId === track.id}
                  isPlaying={currentTrackId === track.id && isActivePlaying}
                  isSelected={selected.has(track.id)}
                  dropAbove={isPlaylistView && dropIndex === virtualRow.index}
                  dropBelow={isPlaylistView && dropIndex === rowCount && virtualRow.index === rowCount - 1}
                  selectedCount={selected.size}
                  draggable={!isPlaylistView}
                  onClick={handleClick}
                  onDoubleClick={handleDoubleClick}
                  onContextMenu={handleContextMenu}
                  onReorderPointerDown={isPlaylistView ? handleReorderPointerDown : undefined}
                />
              );
            })}
            {paddingBottom > 0 && (
              <tr>
                <td style={{ height: paddingBottom, padding: 0 }} colSpan={orderedColumns.length} />
              </tr>
            )}
          </tbody>
        </table>

        {rowCount === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
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
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
            <span className="text-text-tertiary text-xs">No tracks found</span>
            <span className="text-text-tertiary/40 text-[10px]">Try adjusting your search or filters</span>
          </div>
        )}
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

      {deleteConfirm && (
        <ConfirmDialog
          title="Delete from Library"
          message={
            deleteConfirm.length === 1
              ? "Are you sure you want to delete this track? The file will be permanently removed."
              : `Are you sure you want to delete ${deleteConfirm.length} tracks? The files will be permanently removed.`
          }
          confirmLabel="Delete"
          danger
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
});
