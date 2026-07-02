import { memo } from "react";
import { StarRating } from "../../atoms/StarRating/StarRating";
import { CELL_CLASSES } from "./constants";
import type { TrackTableColumn } from "./constants";
import type { LibraryTrack } from "../../../types/library";
import { formatBytes, formatDuration, formatSampleRate } from "../../../utils/format";

interface TrackRowProps {
  track: LibraryTrack;
  index: number;
  columns: TrackTableColumn[];
  isCurrentTrack: boolean;
  isPlaying: boolean;
  isSelected: boolean;
  /** Insertion-line indicators for playlist drag-reorder. */
  dropAbove?: boolean;
  dropBelow?: boolean;
  selectedCount: number;
  /** HTML5 drag (to the play queue). Disabled in playlist view, where rows
   *  reorder via pointer events instead — see onReorderPointerDown. */
  draggable: boolean;
  onClick: (e: React.MouseEvent, track: LibraryTrack) => void;
  onDoubleClick: (track: LibraryTrack) => void;
  onContextMenu: (e: React.MouseEvent, track: LibraryTrack) => void;
  /** Pointer-based playlist reorder (avoids HTML5 DnD, which the Tauri
   *  webview hijacks for OS file-drop). */
  onReorderPointerDown?: (e: React.PointerEvent, index: number) => void;
}

export const TrackRow = memo(function TrackRow({
  track,
  index,
  columns,
  isCurrentTrack,
  isPlaying,
  isSelected,
  dropAbove,
  dropBelow,
  selectedCount,
  draggable,
  onClick,
  onDoubleClick,
  onContextMenu,
  onReorderPointerDown,
}: TrackRowProps) {
  return (
    <tr
      data-index={index}
      draggable={draggable}
      onDragStart={
        draggable
          ? (e) => {
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
            }
          : undefined
      }
      onPointerDown={onReorderPointerDown ? (e) => onReorderPointerDown(e, index) : undefined}
      onClick={(e) => onClick(e, track)}
      onDoubleClick={() => onDoubleClick(track)}
      onContextMenu={(e) => onContextMenu(e, track)}
      className={`group cursor-default select-none transition-colors ${
        isSelected ? "" : isCurrentTrack ? "bg-accent/8 border-l-2 border-l-accent" : "hover:bg-bg-hover/50"
      }`}
    >
      {columns.map((col) => (
        <td
          key={col.key}
          className={`${CELL_CLASSES[col.key]} ${isSelected ? "!bg-accent !text-white" : ""} ${dropAbove ? "border-t-2 border-t-accent" : ""} ${dropBelow ? "border-b-2 border-b-accent" : ""}`}
        >
          {getCellContent(col.key, track, index, isCurrentTrack, isPlaying, isSelected)}
        </td>
      ))}
    </tr>
  );
});

// ── Cell renderers ──────────────────────────────────────────────

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
    case "album_artist":
      // Fall back to the track artist — the same display-artist rule the
      // sort and the artist aggregates use, so rows order by what's shown.
      return track.album_artist || track.artist || "\u2014";
    case "disc_number":
      return track.disc_number || "\u2014";
    case "format":
      return track.format || "\u2014";
    case "bitrate":
      return track.bitrate_kbps ? `${track.bitrate_kbps} kbps` : "\u2014";
    case "sample_rate":
      return track.sample_rate ? formatSampleRate(track.sample_rate) : "\u2014";
    case "file_size":
      return track.file_size ? formatBytes(track.file_size) : "\u2014";
    case "last_played":
      return formatDateAdded(track.last_played ?? 0);
    default:
      return "\u2014";
  }
};
