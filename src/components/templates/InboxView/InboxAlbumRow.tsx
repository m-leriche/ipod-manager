import { CheckPill } from "./CheckPill";
import { isBlocked, isPending } from "./helpers";
import type { AlbumChecks, InboxAlbum } from "./types";

const CHECK_LABELS: Record<keyof AlbumChecks, string> = {
  tags: "Tags",
  cover: "Cover",
  tracklist: "Tracklist",
  duplicate: "Library",
};

export const InboxAlbumRow = ({
  album,
  disabled,
  onFileAway,
}: {
  album: InboxAlbum;
  disabled: boolean;
  onFileAway: (album: InboxAlbum) => void;
}) => {
  const blocked = isBlocked(album);
  const pending = isPending(album);

  return (
    <div className="border border-border rounded-xl px-4 py-3 flex items-center gap-4 bg-bg-card">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-text-primary truncate">{album.album ?? album.folder_name}</div>
        <div className="text-[11px] text-text-tertiary truncate">
          {album.artist ?? "Unknown artist"} · {album.tracks.length} tracks
          {album.year ? ` · ${album.year}` : ""}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {(Object.keys(CHECK_LABELS) as (keyof AlbumChecks)[]).map((key) => (
            <CheckPill key={key} label={CHECK_LABELS[key]} check={album.checks[key]} />
          ))}
        </div>
      </div>
      {pending ? (
        <span className="text-[11px] text-text-tertiary shrink-0">Checking…</span>
      ) : blocked ? (
        <button
          onClick={() => onFileAway(album)}
          disabled={disabled}
          className="px-3 py-1.5 rounded-md text-[11px] font-medium text-danger border border-danger/30 hover:bg-danger/10 transition-colors shrink-0 disabled:opacity-50"
        >
          Override & File
        </button>
      ) : (
        <button
          onClick={() => onFileAway(album)}
          disabled={disabled}
          className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-accent text-bg-primary hover:bg-accent-hover transition-colors shrink-0 disabled:opacity-50"
        >
          File Away
        </button>
      )}
    </div>
  );
};
