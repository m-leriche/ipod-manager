import type { AlbumInfo } from "./types";

interface Props {
  title: string;
  subtitle?: string;
  albums: AlbumInfo[];
  selected?: Set<string>;
  onToggle?: (path: string) => void;
}

export const AlbumGroup = ({ title, subtitle, albums, selected, onToggle }: Props) => {
  const selectable = !!selected && !!onToggle;
  return (
    <div>
      <div className="px-3 py-2 bg-bg-card border-b border-border sticky top-0 z-10">
        <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest">{title}</span>
        {subtitle && <span className="text-[10px] text-text-tertiary ml-2">— {subtitle}</span>}
        <span className="text-[10px] text-text-tertiary ml-2">({albums.length})</span>
      </div>
      {albums.map((a) => (
        <div
          key={a.folder_path}
          className={`flex items-center gap-3 px-3 py-2 border-b border-border-subtle transition-colors ${
            selectable ? "hover:bg-bg-hover/50" : "opacity-40"
          }`}
        >
          {selectable ? (
            <input
              type="checkbox"
              checked={selected!.has(a.folder_path)}
              onChange={() => onToggle!(a.folder_path)}
              className="w-3 h-3 cursor-pointer accent-accent rounded shrink-0"
            />
          ) : (
            <span className="text-success text-[10px] w-3 text-center shrink-0">✓</span>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-text-primary font-medium truncate">
              {a.artist && a.album ? `${a.artist} — ${a.album}` : a.folder_name}
            </div>
            <div className="text-[10px] text-text-tertiary">{a.track_count} tracks</div>
          </div>
        </div>
      ))}
    </div>
  );
};
