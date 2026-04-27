import { memo, useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";
import { ContextMenu } from "../../molecules/ContextMenu/ContextMenu";
import { ConfirmDialog } from "../../atoms/ConfirmDialog/ConfirmDialog";
import { usePlayback } from "../../../contexts/PlaybackContext";
import { usePlaylist } from "../../../contexts/PlaylistContext";
import { useTypeToSelect } from "../../../hooks/useTypeToSelect";
import { useKeyboardNavigation } from "../../../hooks/useKeyboardNavigation";
import { useColumnResize } from "./useColumnResize";
import { useColumnOrder } from "./useColumnOrder";
import { getAlbumTracks } from "./helpers";
import { COLUMNS, ROW_HEIGHT, SORT_KEY_TO_TRACK_FIELD, CELL_CLASSES } from "./constants";
import type { TrackTableColumn } from "./constants";
import type { LibraryTrack } from "../../../types/library";

interface TrackTableProps {
  tracks: LibraryTrack[];
  sortBy: string;
  sortDirection: "asc" | "desc";
  onSort: (key: string) => void;
  onTrackSelect?: (track: LibraryTrack) => void;
  onSelectionChange?: (selectedIds: Set<number>) => void;
  onNavigateToArtist?: (artist: string) => void;
  onNavigateToAlbum?: (album: string, artist: string) => void;
  onTracksDeleted?: () => void;
  onFlagTracks?: (trackIds: number[], flagged: boolean) => void;
  activePlaylistId?: number | null;
}

interface ContextMenuState {
  x: number;
  y: number;
  track: LibraryTrack;
}

export const TrackTable = memo(function TrackTable({
  tracks,
  sortBy,
  sortDirection,
  onSort,
  onTrackSelect,
  onSelectionChange,
  onNavigateToArtist,
  onNavigateToAlbum,
  onTracksDeleted,
  onFlagTracks,
  activePlaylistId,
}: TrackTableProps) {
  const { state, playTrack, playNext, addToQueue } = usePlayback();
  const { playlists, addTracks: addToPlaylist, removeTracks: removeFromPlaylist, moveTrack } = usePlaylist();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number[] | null>(null);
  const [rowDragFrom, setRowDragFrom] = useState<number | null>(null);
  const [rowDragOver, setRowDragOver] = useState<number | null>(null);
  const { orderedColumns, dragIndex, dragOverIndex, setHeaderRef, onReorderStart } = useColumnOrder(COLUMNS);
  const orderedDefs = useMemo(() => orderedColumns.map((c) => c.def), [orderedColumns]);
  const { widths, onResizeStart } = useColumnResize(orderedDefs);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Ref for selected so handleClick doesn't depend on selected state
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useEffect(() => {
    onSelectionChange?.(selected);
  }, [selected, onSelectionChange]);

  const totalWidth = useMemo(() => widths.reduce((a, b) => a + b, 0), [widths]);

  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  const searchField = SORT_KEY_TO_TRACK_FIELD[sortBy] ?? "title";
  const searchLabels = useMemo(
    () => tracks.map((t) => String(t[searchField] ?? t.title ?? t.file_name ?? "")),
    [tracks, searchField],
  );

  // ── Keyboard navigation ──────────────────────────────────────

  const lastClickedIndexRef = useRef(0);

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

  const handleKeyboardDeselect = useCallback(() => {
    setSelected(new Set());
  }, []);

  const { onKeyDown: handleNavKeyDown, focusedIndexRef } = useKeyboardNavigation({
    count: tracks.length,
    onNavigate: handleKeyboardNavigate,
    onActivate: handleKeyboardActivate,
    onDeselect: handleKeyboardDeselect,
    virtualizer,
    selectedIndex: lastClickedIndexRef.current,
  });

  // ── Type-to-select ───────────────────────────────────────────

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

  // Stable callbacks — accept track as parameter, no inline closures per row
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
      // Sync keyboard nav position
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
    // If right-clicked track isn't in current selection, select only it
    if (!selectedRef.current.has(track.id)) {
      setSelected(new Set([track.id]));
    }
    setContextMenu({ x: e.clientX, y: e.clientY, track });
  }, []);

  // ── Playlist drag-to-reorder ──────────────────────────────────

  const isPlaylistView = activePlaylistId != null;

  const handleRowDragStart = useCallback((e: React.DragEvent, index: number) => {
    setRowDragFrom(index);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleRowDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setRowDragOver(index);
  }, []);

  const handleRowDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      if (rowDragFrom !== null && rowDragFrom !== toIndex && activePlaylistId != null) {
        moveTrack(activePlaylistId, rowDragFrom, toIndex);
      }
      setRowDragFrom(null);
      setRowDragOver(null);
    },
    [rowDragFrom, activePlaylistId, moveTrack],
  );

  const handleRowDragEnd = useCallback(() => {
    setRowDragFrom(null);
    setRowDragOver(null);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm) return;
    try {
      await invoke("delete_library_tracks", { trackIds: deleteConfirm });
      setSelected(new Set());
      onTracksDeleted?.();
    } catch (e) {
      console.error("Failed to delete tracks:", e);
    }
    setDeleteConfirm(null);
  }, [deleteConfirm, onTracksDeleted]);

  const contextMenuItems = contextMenu
    ? [
        {
          label: "Play",
          onClick: () => {
            playTrack(contextMenu.track, getAlbumTracks(contextMenu.track, tracks));
            setContextMenu(null);
          },
        },
        {
          label: "Play Next",
          onClick: () => {
            playNext([contextMenu.track]);
            setContextMenu(null);
          },
        },
        {
          label: "Add to Queue",
          onClick: () => {
            addToQueue([contextMenu.track]);
            setContextMenu(null);
          },
        },
        ...(playlists.length > 0
          ? [
              {
                type: "submenu" as const,
                label: "Add to Playlist",
                children: playlists.map((p) => ({
                  label: p.name,
                  onClick: () => {
                    const ids =
                      selected.size > 1 && selected.has(contextMenu.track.id) ? [...selected] : [contextMenu.track.id];
                    addToPlaylist(p.id, ids);
                    setContextMenu(null);
                  },
                })),
              },
            ]
          : []),
        ...(activePlaylistId != null
          ? [
              {
                label:
                  selected.size > 1 && selected.has(contextMenu.track.id)
                    ? `Remove ${selected.size} from Playlist`
                    : "Remove from Playlist",
                onClick: () => {
                  const ids =
                    selected.size > 1 && selected.has(contextMenu.track.id) ? [...selected] : [contextMenu.track.id];
                  removeFromPlaylist(activePlaylistId, ids);
                  setContextMenu(null);
                },
              },
            ]
          : []),
        { type: "separator" as const },
        {
          label: (() => {
            const ids =
              selected.size > 1 && selected.has(contextMenu.track.id) ? [...selected] : [contextMenu.track.id];
            const relevant = tracks.filter((t) => ids.includes(t.id));
            const allFlagged = relevant.every((t) => t.flagged);
            if (selected.size > 1 && selected.has(contextMenu.track.id)) {
              return allFlagged
                ? `Remove ${selected.size} Tracks from Sync List`
                : `Add ${selected.size} Tracks to Sync List`;
            }
            return allFlagged ? "Remove from Sync List" : "Add to Sync List";
          })(),
          onClick: () => {
            const ids =
              selected.size > 1 && selected.has(contextMenu.track.id) ? [...selected] : [contextMenu.track.id];
            const relevant = tracks.filter((t) => ids.includes(t.id));
            const allFlagged = relevant.every((t) => t.flagged);
            onFlagTracks?.(ids, !allFlagged);
            setContextMenu(null);
          },
        },
        ...(contextMenu.track.artist && onNavigateToArtist
          ? [
              {
                label: `Go to ${contextMenu.track.artist}`,
                onClick: () => {
                  onNavigateToArtist(contextMenu.track.artist!);
                  setContextMenu(null);
                },
              },
            ]
          : []),
        ...(contextMenu.track.album && onNavigateToAlbum
          ? [
              {
                label: `Go to ${contextMenu.track.album}`,
                onClick: () => {
                  onNavigateToAlbum(
                    contextMenu.track.album!,
                    contextMenu.track.artist || contextMenu.track.album_artist || "",
                  );
                  setContextMenu(null);
                },
              },
            ]
          : []),
        { type: "separator" as const },
        {
          label:
            selected.size > 1 && selected.has(contextMenu.track.id)
              ? `Delete ${selected.size} Tracks from Library`
              : "Delete from Library",
          onClick: () => {
            const ids =
              selected.size > 1 && selected.has(contextMenu.track.id) ? [...selected] : [contextMenu.track.id];
            setDeleteConfirm(ids);
            setContextMenu(null);
          },
        },
      ]
    : [];

  const currentTrackId = state.currentTrack?.id ?? null;
  const isActivePlaying = state.isPlaying;
  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems[0]?.start ?? 0;
  const paddingBottom =
    virtualItems.length > 0 ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto outline-none" tabIndex={0} onKeyDown={handleKeyDown}>
      <table className="table-fixed" style={{ width: totalWidth }}>
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
                    {isActive && <span className="text-[8px]">{sortDirection === "asc" ? "▲" : "▼"}</span>}
                  </span>
                  {/* Resize handle — wide hit area, thin visible line */}
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
            return (
              <TrackRowDynamic
                key={track.id}
                track={track}
                index={virtualRow.index}
                columns={orderedColumns}
                isCurrentTrack={currentTrackId === track.id}
                isPlaying={currentTrackId === track.id && isActivePlaying}
                isSelected={selected.has(track.id)}
                isDragOver={rowDragOver === virtualRow.index && rowDragFrom !== virtualRow.index}
                draggable={isPlaylistView}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                onContextMenu={handleContextMenu}
                onDragStart={isPlaylistView ? handleRowDragStart : undefined}
                onDragOver={isPlaylistView ? handleRowDragOver : undefined}
                onDrop={isPlaylistView ? handleRowDrop : undefined}
                onDragEnd={isPlaylistView ? handleRowDragEnd : undefined}
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

      {tracks.length === 0 && (
        <div className="flex items-center justify-center h-48 text-text-tertiary text-xs">No tracks found</div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
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

const formatDuration = (secs: number): string => {
  if (!isFinite(secs) || secs < 0) return "—";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const formatDateAdded = (epoch: number): string => {
  if (!epoch) return "—";
  const d = new Date(epoch * 1000);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

const getCellContent = (
  key: string,
  track: LibraryTrack,
  index: number,
  isCurrentTrack: boolean,
  isPlaying: boolean,
  isSelected: boolean,
): React.ReactNode => {
  switch (key) {
    case "flagged":
      return track.flagged ? (
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className={`w-3 h-3 mx-auto ${isSelected ? "text-white" : "text-accent"}`}
        >
          <path d="M4 24V1h16l-5 7.5L20 16H6v8z" />
        </svg>
      ) : null;
    case "#": {
      const barColor = isSelected ? "bg-white" : "bg-accent";
      return isCurrentTrack ? (
        <div className="flex items-center justify-center gap-[2px] h-3">
          <span className={`w-[3px] ${barColor} rounded-full ${isPlaying ? "animate-equalizer-1" : "h-[6px]"}`} />
          <span className={`w-[3px] ${barColor} rounded-full ${isPlaying ? "animate-equalizer-2" : "h-[4px]"}`} />
          <span className={`w-[3px] ${barColor} rounded-full ${isPlaying ? "animate-equalizer-3" : "h-[6px]"}`} />
        </div>
      ) : (
        <span className={isSelected ? "" : "text-text-tertiary"}>{index + 1}</span>
      );
    }
    case "title":
      return (
        <div
          className={`text-xs font-medium truncate ${isSelected ? "" : isCurrentTrack ? "text-accent" : "text-text-primary"}`}
        >
          {track.title || track.file_name}
        </div>
      );
    case "artist":
      return track.artist || "—";
    case "album":
      return track.album || "—";
    case "genre":
      return track.genre || "—";
    case "track_number":
      return track.track_number || "—";
    case "year":
      return track.year || "—";
    case "duration":
      return formatDuration(track.duration_secs);
    case "date_added":
      return formatDateAdded(track.created_at);
    case "plays":
      return track.play_count || "—";
    default:
      return "—";
  }
};

const TrackRowDynamic = memo(function TrackRowDynamic({
  track,
  index,
  columns,
  isCurrentTrack,
  isPlaying,
  isSelected,
  isDragOver,
  draggable,
  onClick,
  onDoubleClick,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  track: LibraryTrack;
  index: number;
  columns: TrackTableColumn[];
  isCurrentTrack: boolean;
  isPlaying: boolean;
  isSelected: boolean;
  isDragOver?: boolean;
  draggable?: boolean;
  onClick: (e: React.MouseEvent, track: LibraryTrack) => void;
  onDoubleClick: (track: LibraryTrack) => void;
  onContextMenu: (e: React.MouseEvent, track: LibraryTrack) => void;
  onDragStart?: (e: React.DragEvent, index: number) => void;
  onDragOver?: (e: React.DragEvent, index: number) => void;
  onDrop?: (e: React.DragEvent, index: number) => void;
  onDragEnd?: () => void;
}) {
  return (
    <tr
      draggable={draggable}
      onClick={(e) => onClick(e, track)}
      onDoubleClick={() => onDoubleClick(track)}
      onContextMenu={(e) => onContextMenu(e, track)}
      onDragStart={onDragStart ? (e) => onDragStart(e, index) : undefined}
      onDragOver={onDragOver ? (e) => onDragOver(e, index) : undefined}
      onDrop={onDrop ? (e) => onDrop(e, index) : undefined}
      onDragEnd={onDragEnd}
      className={`group cursor-default select-none transition-colors ${
        isSelected ? "" : isCurrentTrack ? "bg-accent/5" : "hover:bg-bg-hover/50"
      } ${isDragOver ? "!border-t-2 !border-t-accent" : ""}`}
    >
      {columns.map((col) => (
        <td
          key={col.key}
          className={`${CELL_CLASSES[col.key]} ${isSelected ? "!bg-accent !text-white" : ""} ${isDragOver ? "border-t-2 border-t-accent" : ""}`}
        >
          {getCellContent(col.key, track, index, isCurrentTrack, isPlaying, isSelected)}
        </td>
      ))}
    </tr>
  );
});
