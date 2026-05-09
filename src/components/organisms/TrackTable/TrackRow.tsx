import { memo } from "react";
import { StarRating } from "../../atoms/StarRating/StarRating";
import { CELL_CLASSES } from "./constants";
import type { TrackTableColumn } from "./constants";
import type { LibraryTrack } from "../../../types/library";

interface TrackRowProps {
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
}

export const TrackRow = memo(function TrackRow({
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
}: TrackRowProps) {
  return (
    <tr
      data-index={index}
      draggable
      onDragStart={(e) => {
        const count = isSelected && selectedCount > 1 ? selectedCount : 1;
        const label = count > 1 ? `${count} tracks` : track.title || track.file_name;
        e.dataTransfer.setData("application/x-crate-queue-drag", "1");
        e.dataTransfer.effectAllowed = "copy";
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

// ── Cell renderers ──────────────────────────────────────────────

const formatDuration = (secs: number): string => {
  if (!isFinite(secs) || secs < 0) return "\u2014";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const formatDateAdded = (epoch: number): string => {
  if (!epoch) return "\u2014";
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
      return track.artist || "\u2014";
    case "album":
      return track.album || "\u2014";
    case "genre":
      return track.genre || "\u2014";
    case "track_number":
      return track.track_number || "\u2014";
    case "year":
      return track.year || "\u2014";
    case "duration":
      return formatDuration(track.duration_secs);
    case "date_added":
      return formatDateAdded(track.created_at);
    case "rating":
      return <StarRating rating={track.rating} size="sm" />;
    case "plays":
      return track.play_count || "\u2014";
    default:
      return "\u2014";
  }
};
