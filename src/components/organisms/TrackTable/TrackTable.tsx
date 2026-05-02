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
import { getAlbumTracks, getContextIds } from "./helpers";
import { COLUMNS, ROW_HEIGHT, SORT_KEY_TO_TRACK_FIELD, CELL_CLASSES } from "./constants";
import type { TrackTableColumn } from "./constants";
import type { LibraryTrack } from "../../../types/library";

// Module-level drag payload so drop targets can read the tracks
let dragPayload: LibraryTrack[] = [];
export const getDragPayload = (): LibraryTrack[] => dragPayload;

interface TrackTableProps {
  tracks: LibraryTrack[];
  sortBy: string;
  sortDirection: "asc" | "desc";
  onSort: (key: string) => void;
  onTrackSelect?: (track: LibraryTrack) => void;
  onSelectionChange?: (selectedIds: Set<number>) => void;
  onTracksDeleted?: () => void;
  onFlagTracks?: (trackIds: number[], flagged: boolean) => void;
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
  sortBy,
  sortDirection,
  onSort,
  onTrackSelect,
  onSelectionChange,
  onTracksDeleted,
  onFlagTracks,
  onRepairMetadata,
  activePlaylistId,
}: TrackTableProps) {
  const { state, playTrack, playNext, addToQueue } = usePlayback();
  const { playlists, addTracks: addToPlaylist, removeTracks: removeFromPlaylist, moveTrack } = usePlaylist();
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

        // Find which row the mouse is over
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
          // Find drop target from final mouse position
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
      alert(`Failed to delete tracks: ${e}`);
    }
    setDeleteConfirm(null);
  }, [deleteConfirm, onTracksDeleted]);

  const contextMenuItems = contextMenu
    ? (() => {
        const ids = getContextIds(contextMenu.track.id, selected);
        const isMulti = ids.length > 1;
        return [
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
                  label: isMulti ? `Remove ${ids.length} from Playlist` : "Remove from Playlist",
                  onClick: () => {
                    removeFromPlaylist(activePlaylistId, ids);
                    setContextMenu(null);
                  },
                },
              ]
            : []),
          { type: "separator" as const },
          {
            label: (() => {
              const relevant = tracks.filter((t) => ids.includes(t.id));
              const allFlagged = relevant.every((t) => t.flagged);
              if (isMulti) {
                return allFlagged
                  ? `Remove ${ids.length} Tracks from Sync List`
                  : `Add ${ids.length} Tracks to Sync List`;
              }
              return allFlagged ? "Remove from Sync List" : "Add to Sync List";
            })(),
            onClick: () => {
              const relevant = tracks.filter((t) => ids.includes(t.id));
              const allFlagged = relevant.every((t) => t.flagged);
              onFlagTracks?.(ids, !allFlagged);
              setContextMenu(null);
            },
          },
          ...(onRepairMetadata
            ? [
                {
                  label: isMulti ? `Repair Metadata for ${ids.length} Tracks` : "Repair Metadata",
                  onClick: () => {
                    onRepairMetadata(tracks.filter((t) => ids.includes(t.id)));
                    setContextMenu(null);
                  },
                },
              ]
            : []),
          { type: "separator" as const },
          {
            label: isMulti ? `Delete ${ids.length} Tracks from Library` : "Delete from Library",
            onClick: () => {
              setDeleteConfirm(ids);
              setContextMenu(null);
            },
          },
        ];
      })()
    : [];

  const currentTrackId = state.currentTrack?.id ?? null;
  const isActivePlaying = state.isPlaying;
  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems[0]?.start ?? 0;
  const paddingBottom =
    virtualItems.length > 0 ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <div
      ref={scrollRef}
      className="flex-1 min-h-0 overflow-auto outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onDragStartCapture={() => {
        // Populate module-level drag payload with currently selected tracks (or all if none selected)
        dragPayload = selected.size > 0 ? tracks.filter((t) => selected.has(t.id)) : [];
      }}
    >
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
  selectedCount,
  onClick,
  onDoubleClick,
  onContextMenu,
  onMouseDown,
}: {
  track: LibraryTrack;
  index: number;
  columns: TrackTableColumn[];
  isCurrentTrack: boolean;
  isPlaying: boolean;
  isSelected: boolean;
  isDragOver?: boolean;
  selectedCount: number;
  onClick: (e: React.MouseEvent, track: LibraryTrack) => void;
  onDoubleClick: (track: LibraryTrack) => void;
  onContextMenu: (e: React.MouseEvent, track: LibraryTrack) => void;
  onMouseDown?: (e: React.MouseEvent, index: number) => void;
}) {
  return (
    <tr
      data-index={index}
      draggable
      onDragStart={(e) => {
        const count = isSelected && selectedCount > 1 ? selectedCount : 1;
        const label = count > 1 ? `${count} tracks` : track.title || track.file_name;
        e.dataTransfer.setData("application/x-crate-queue-drag", "1");
        e.dataTransfer.effectAllowed = "copy";
        // Store payload for drop target to read
        // dragPayload is set by the parent table's onDragStartCapture
        const el = document.createElement("div");
        el.textContent = label;
        el.className = "fixed -top-[100px] left-0 px-2 py-1 bg-accent text-white text-[11px] rounded";
        document.body.appendChild(el);
        e.dataTransfer.setDragImage(el, 0, 0);
        requestAnimationFrame(() => el.remove());
      }}
      onClick={(e) => onClick(e, track)}
      onDoubleClick={() => onDoubleClick(track)}
      onContextMenu={(e) => onContextMenu(e, track)}
      onMouseDown={onMouseDown ? (e) => onMouseDown(e, index) : undefined}
      className={`group cursor-default select-none transition-colors ${
        isSelected ? "" : isCurrentTrack ? "bg-accent/8 border-l-2 border-l-accent" : "hover:bg-bg-hover/50"
      }`}
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
