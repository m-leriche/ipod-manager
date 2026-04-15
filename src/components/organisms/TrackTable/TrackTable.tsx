import { memo, useState, useCallback, useMemo } from "react";
import { ContextMenu } from "../../molecules/ContextMenu/ContextMenu";
import { usePlayback } from "../../../contexts/PlaybackContext";
import { useColumnResize } from "./useColumnResize";
import type { ColumnDef } from "./useColumnResize";
import type { LibraryTrack } from "../../../types/library";

interface TrackTableProps {
  tracks: LibraryTrack[];
  sortBy: string;
  sortDirection: "asc" | "desc";
  onSort: (key: string) => void;
  onTrackSelect?: (track: LibraryTrack) => void;
  onNavigateToArtist?: (artist: string) => void;
  onNavigateToAlbum?: (album: string, artist: string) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  track: LibraryTrack;
}

const COLUMNS: { key: string; label: string; sortKey: string; align: "left" | "right"; def: ColumnDef }[] = [
  { key: "#", label: "#", sortKey: "track_number", align: "left", def: { key: "#", minWidth: 40, initialWidth: 40 } },
  {
    key: "title",
    label: "Title",
    sortKey: "title",
    align: "left",
    def: { key: "title", minWidth: 100, initialWidth: 280 },
  },
  {
    key: "artist",
    label: "Artist",
    sortKey: "artist",
    align: "left",
    def: { key: "artist", minWidth: 80, initialWidth: 200 },
  },
  {
    key: "album",
    label: "Album",
    sortKey: "album",
    align: "left",
    def: { key: "album", minWidth: 80, initialWidth: 200 },
  },
  {
    key: "genre",
    label: "Genre",
    sortKey: "genre",
    align: "left",
    def: { key: "genre", minWidth: 60, initialWidth: 120 },
  },
  {
    key: "year",
    label: "Year",
    sortKey: "year",
    align: "right",
    def: { key: "year", minWidth: 45, initialWidth: 55 },
  },
  {
    key: "duration",
    label: "Time",
    sortKey: "duration",
    align: "right",
    def: { key: "duration", minWidth: 45, initialWidth: 55 },
  },
];

const columnDefs = COLUMNS.map((c) => c.def);

export const TrackTable = memo(function TrackTable({
  tracks,
  sortBy,
  sortDirection,
  onSort,
  onTrackSelect,
  onNavigateToArtist,
  onNavigateToAlbum,
}: TrackTableProps) {
  const { state, playTrack, playNext, addToQueue } = usePlayback();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const { widths, onResizeStart } = useColumnResize(columnDefs);

  const totalWidth = useMemo(() => widths.reduce((a, b) => a + b, 0), [widths]);

  const handleClick = useCallback(
    (e: React.MouseEvent, track: LibraryTrack) => {
      if (e.metaKey || e.ctrlKey) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(track.id)) next.delete(track.id);
          else next.add(track.id);
          return next;
        });
      } else if (e.shiftKey && selected.size > 0) {
        const trackIds = tracks.map((t) => t.id);
        const lastSelected = [...selected].pop()!;
        const lastIdx = trackIds.indexOf(lastSelected);
        const currentIdx = trackIds.indexOf(track.id);
        const [start, end] = [Math.min(lastIdx, currentIdx), Math.max(lastIdx, currentIdx)];
        const range = new Set(trackIds.slice(start, end + 1));
        setSelected((prev) => new Set([...prev, ...range]));
      } else {
        setSelected(new Set([track.id]));
      }
      onTrackSelect?.(track);
    },
    [selected, tracks, onTrackSelect],
  );

  const handleDoubleClick = useCallback(
    (track: LibraryTrack) => {
      playTrack(track, tracks);
    },
    [playTrack, tracks],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent, track: LibraryTrack) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, track });
  }, []);

  const contextMenuItems = contextMenu
    ? [
        {
          label: "Play",
          onClick: () => {
            playTrack(contextMenu.track, tracks);
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
      ]
    : [];

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <table className="table-fixed" style={{ minWidth: totalWidth }}>
        <colgroup>
          {widths.map((w, i) => (
            <col key={COLUMNS[i].key} style={{ width: w }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-bg-primary">
          <tr className="border-b border-border">
            {COLUMNS.map((col, i) => {
              const isActive = col.sortKey === sortBy;
              return (
                <th
                  key={col.key}
                  onClick={() => onSort(col.sortKey)}
                  className={`relative px-3 py-2 text-[10px] font-medium uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-text-primary ${
                    isActive ? "text-text-primary" : "text-text-tertiary"
                  } ${col.align === "right" ? "text-right" : "text-left"}`}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {isActive && <span className="text-[8px]">{sortDirection === "asc" ? "▲" : "▼"}</span>}
                  </span>
                  {/* Resize handle — wide hit area, thin visible line */}
                  {i < COLUMNS.length - 1 && (
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
          {tracks.map((track, i) => (
            <TrackRowResizable
              key={track.id}
              track={track}
              index={i}
              isPlaying={state.currentTrack?.id === track.id}
              isSelected={selected.has(track.id)}
              onClick={(e) => handleClick(e, track)}
              onDoubleClick={() => handleDoubleClick(track)}
              onContextMenu={(e) => handleContextMenu(e, track)}
            />
          ))}
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
    </div>
  );
});

// Inline row that matches the 7-column layout
const formatDuration = (secs: number): string => {
  if (!isFinite(secs) || secs < 0) return "—";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const TrackRowResizable = memo(function TrackRowResizable({
  track,
  index,
  isPlaying,
  isSelected,
  onClick,
  onDoubleClick,
  onContextMenu,
}: {
  track: LibraryTrack;
  index: number;
  isPlaying: boolean;
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <tr
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className={`group cursor-default select-none transition-colors ${
        isSelected ? "bg-accent/10" : isPlaying ? "bg-accent/5" : "hover:bg-bg-hover/50"
      }`}
    >
      <td className="px-3 py-[7px] text-[11px] tabular-nums text-center overflow-hidden">
        {isPlaying ? (
          <div className="flex items-center justify-center gap-[2px] h-3">
            <span className="w-[3px] bg-accent rounded-full animate-equalizer-1" />
            <span className="w-[3px] bg-accent rounded-full animate-equalizer-2" />
            <span className="w-[3px] bg-accent rounded-full animate-equalizer-3" />
          </div>
        ) : (
          <span className="text-text-tertiary">{index + 1}</span>
        )}
      </td>
      <td className="px-3 py-[7px] overflow-hidden">
        <div className={`text-xs font-medium truncate ${isPlaying ? "text-accent" : "text-text-primary"}`}>
          {track.title || track.file_name}
        </div>
      </td>
      <td className="px-3 py-[7px] text-[11px] text-text-secondary overflow-hidden truncate">{track.artist || "—"}</td>
      <td className="px-3 py-[7px] text-[11px] text-text-tertiary overflow-hidden truncate">{track.album || "—"}</td>
      <td className="px-3 py-[7px] text-[11px] text-text-tertiary overflow-hidden truncate">{track.genre || "—"}</td>
      <td className="px-3 py-[7px] text-[11px] text-text-tertiary tabular-nums text-right overflow-hidden">
        {track.year || "—"}
      </td>
      <td className="px-3 py-[7px] text-[11px] text-text-tertiary tabular-nums text-right overflow-hidden">
        {formatDuration(track.duration_secs)}
      </td>
    </tr>
  );
});
