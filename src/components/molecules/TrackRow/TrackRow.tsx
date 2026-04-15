import type { LibraryTrack } from "../../../types/library";

interface TrackRowProps {
  track: LibraryTrack;
  index: number;
  isPlaying: boolean;
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const formatDuration = (secs: number): string => {
  if (!isFinite(secs) || secs < 0) return "—";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export const TrackRow = ({
  track,
  index,
  isPlaying,
  isSelected,
  onClick,
  onDoubleClick,
  onContextMenu,
}: TrackRowProps) => (
  <tr
    onClick={onClick}
    onDoubleClick={onDoubleClick}
    onContextMenu={onContextMenu}
    className={`group cursor-default select-none transition-colors ${
      isSelected ? "bg-accent/10" : isPlaying ? "bg-accent/5" : "hover:bg-bg-hover/50"
    }`}
  >
    <td className="px-3 py-[7px] text-[11px] tabular-nums w-10 text-center">
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
    <td className="px-3 py-[7px]">
      <div className={`text-xs font-medium truncate ${isPlaying ? "text-accent" : "text-text-primary"}`}>
        {track.title || track.file_name}
      </div>
    </td>
    <td className="px-3 py-[7px] text-[11px] text-text-secondary truncate">{track.artist || "—"}</td>
    <td className="px-3 py-[7px] text-[11px] text-text-tertiary truncate">{track.album || "—"}</td>
    <td className="px-3 py-[7px] text-[11px] text-text-tertiary tabular-nums text-right">
      {formatDuration(track.duration_secs)}
    </td>
  </tr>
);
