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
import { COLUMNS, ROW_HEIGHT, SORT_KEY_TO_TRACK_FIELD } from "./constants";
import type { LibraryTrack } from "../../../types/library";

// Module-level drag payload so drop targets can read the tracks
let dragPayload: LibraryTrack[] = [];
export const getDragPayload = (): LibraryTrack[] => dragPayload;

interface TrackTableProps {
  tracks: LibraryTrack[];
  totalTrackCount?: number;
  onLoadMore?: (startIndex: number) => void;
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
  onFetchLyrics?: (track: LibraryTrack) => void;
  onFetchAllLyrics?: () => void;
  isFetchingAllLyrics?: boolean;
  onRepairMetadata?: (tracks: LibraryTrack[]) => void;
  activePlaylistId?: number | null;
}

interface ContextMenuState {
  x: number;
  y: number;
  track: LibraryTrack;
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
  onFetchAllLyrics,
  isFetchingAllLyrics,
  onRepairMetadata,
  activePlaylistId,
}: TrackTableProps) {
  const { state, playTrack } = usePlayback();
  const { moveTrack } = usePlaylist();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number[] | null>(null);
  const [reorderDragOver, setReorderDragOver] = useState<number | null>(null);
  const reorderFromRef = useRef<number | null>(null);
  const reorderStartYRef = useRef(0);
  const reorderActiveRef = useRef(false);
  const { orderedColumns, dragIndex, dragOverIndex, setHeaderRef, onReorderStart } = useColumnOrder(COLUMNS);
  const orderedDefs = useMemo(() => orderedColumns.map((c) => c.def), [orderedColumns]);
  const { widths, onResizeStart } = useColumnResize(orderedDefs);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const virtualItems = virtualizer.getVirtualItems();
  useEffect(() => {
    if (!onLoadMore || !totalTrackCount) return;
    if (virtualItems.length === 0) return;
    const lastItem = virtualItems[virtualItems.length - 1];
    if (lastItem.index >= tracks.length - 100 && tracks.length < totalTrackCount) {
      onLoadMore(tracks.length);
    }
  }, [virtualItems, tracks.length, totalTrackCount, onLoadMore]);

  // ── Keyboard navigation ──────────────────────────────────────

  const lastClickedIndexRef = useRef(0);
  const searchField = SORT_KEY_TO_TRACK_FIELD[sortBy] ?? "title";
  const searchLabels = useMemo(
    () => tracks.map((t) => String(t[searchField] ?? t.title ?? t.file_name ?? "")),
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
        const rangeIds = new Set(tracks.slice(start, end + 1).map((t) => t.id));
        setSelected(rangeIds);
      }
      onTrackSelect?.(track);
    },
    [tracks, onTrackSelect],
  );

  const handleKeyboardActivate = useCallback(
    (index: number) => {
      const track = tracks[index];
      if (track) playTrack(track, getAlbumTracks(track, tracks));
    },
    [tracks, playTrack],
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
      const clickedIndex = tracks.findIndex((t) => t.id === track.id);
      if (e.metaKey || e.ctrlKey) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(track.id)) next.delete(track.id);
          else next.add(track.id);
          return next;
        });
      } else if (e.shiftKey && sel.size > 0) {
        const trackIds = tracks.map((t) => t.id);
        const lastIdx = lastClickedIndexRef.current;
        const currentIdx = clickedIndex;
        const [start, end] = [Math.min(lastIdx, currentIdx), Math.max(lastIdx, currentIdx)];
        const range = new Set(trackIds.slice(start, end + 1));
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
      const contextTracks = activePlaylistId != null ? tracks : getAlbumTracks(track, tracks);
      playTrack(track, contextTracks);
    },
    [playTrack, tracks, activePlaylistId],
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
    tracks,
    selected,
    contextMenu,
    activePlaylistId,
    onFlagTracks,
    onRateTracks,
    onRepairAlbumArt,
    onRepairAllAlbumArt,
    isRepairingAllArt,
    onFetchLyrics,
    onFetchAllLyrics,
    isFetchingAllLyrics,
    onRepairMetadata,
    onClose: useCallback(() => setContextMenu(null), []),
    onDeleteRequest: useCallback((ids: number[]) => setDeleteConfirm(ids), []),
  });

  // ── Playlist drag-to-reorder ──────────────────────────────────

  const isPlaylistView = activePlaylistId != null;

  const handleReorderMouseDown = useCallback(
    (e: React.MouseEvent, index: number) => {
      if (!isPlaylistView || e.button !== 0) return;
      reorderFromRef.current = index;
      reorderStartYRef.current = e.clientY;
      reorderActiveRef.current = false;

      const handleMouseMove = (ev: MouseEvent) => {
        if (!reorderActiveRef.current && Math.abs(ev.clientY - reorderStartYRef.current) > 5) {
          reorderActiveRef.current = true;
        }
        if (!reorderActiveRef.current || !scrollRef.current) return;
        const rows = scrollRef.current.querySelectorAll("tbody tr[data-index]");
        let targetIndex: number | null = null;
        for (const row of rows) {
          const rect = row.getBoundingClientRect();
          if (ev.clientY >= rect.top && ev.clientY < rect.bottom) {
            targetIndex = parseInt((row as HTMLElement).dataset.index!, 10);
            break;
          }
        }
        setReorderDragOver(targetIndex);
      };

      const handleMouseUp = (ev: MouseEvent) => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        if (reorderActiveRef.current && reorderFromRef.current !== null && activePlaylistId != null) {
          const rows = scrollRef.current?.querySelectorAll("tbody tr[data-index]");
          let targetIndex: number | null = null;
          if (rows) {
            for (const row of rows) {
              const rect = row.getBoundingClientRect();
              if (ev.clientY >= rect.top && ev.clientY < rect.bottom) {
                targetIndex = parseInt((row as HTMLElement).dataset.index!, 10);
                break;
              }
            }
          }
          if (targetIndex !== null && targetIndex !== reorderFromRef.current) {
            moveTrack(activePlaylistId, reorderFromRef.current, targetIndex);
          }
        }
        reorderFromRef.current = null;
        reorderActiveRef.current = false;
        setReorderDragOver(null);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [isPlaylistView, activePlaylistId, moveTrack],
  );

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
    <div
      ref={scrollRef}
      className="flex-1 min-h-0 overflow-auto outline-none view-enter bg-bg-primary"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onDragStartCapture={() => {
        dragPayload = selected.size > 0 ? tracks.filter((t) => selected.has(t.id)) : [];
      }}
    >
      <table className="table-fixed border-collapse" style={{ width: totalWidth }}>
        <colgroup>
          {orderedColumns.map((col, i) => (
            <col key={col.key} style={{ width: widths[i] }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-bg-primary">
          <tr className="border-b border-border">
            {orderedColumns.map((col, i) => {
              const isActive = col.sortKey === sortBy;
              const isDragging = dragIndex === i;
              const isDragOver = dragOverIndex === i && dragIndex !== i;
              return (
                <th
                  key={col.key}
                  ref={(el) => setHeaderRef(i, el)}
                  onMouseDown={(e) => onReorderStart(i, e)}
                  onClick={() => onSort(col.sortKey)}
                  className={`relative px-3 py-2 text-[10px] font-medium uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-text-primary ${
                    isActive ? "text-text-primary" : "text-text-tertiary"
                  } ${col.align === "right" ? "text-right" : "text-left"} ${
                    isDragging ? "opacity-40" : ""
                  } ${isDragOver ? "!border-l-2 !border-l-accent" : ""}`}
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
                </th>
              );
            })}
          </tr>
        </thead>
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
                isDragOver={reorderDragOver === virtualRow.index}
                selectedCount={selected.size}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                onContextMenu={handleContextMenu}
                onMouseDown={isPlaylistView ? handleReorderMouseDown : undefined}
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
