import { useState } from "react";
import { CheckPill } from "./CheckPill";
import { InboxAlbumDetails } from "./InboxAlbumDetails";
import { ReleaseComparisonPanel } from "./ReleaseComparisonPanel";
import { isBlocked, isPending } from "./helpers";
import type { AlbumChecks, ConvertTarget, InboxAlbum } from "./types";

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
  onConvert,
}: {
  album: InboxAlbum;
  disabled: boolean;
  onFileAway: (album: InboxAlbum) => void;
  onConvert: (album: InboxAlbum, target: ConvertTarget) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [comparing, setComparing] = useState(false);
  const blocked = isBlocked(album);
  const pending = isPending(album);
  // The comparison is keyed on artist + album; without both there is nothing
  // to look up on MusicBrainz.
  const canCompare = Boolean(album.artist && album.album) && album.checks.tracklist.status !== "pending";

  return (
    <div className="border border-border rounded-xl px-4 py-3 bg-bg-card">
      <div className="flex items-center gap-4">
        <button
          onClick={() => setExpanded((prev) => !prev)}
          aria-label={expanded ? "Hide files" : "Show files"}
          aria-expanded={expanded}
          className="text-text-tertiary hover:text-text-secondary transition-colors shrink-0"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-text-primary truncate">{album.album ?? album.folder_name}</div>
          <div className="text-[11px] text-text-tertiary truncate">
            {album.artist ?? "Unknown artist"} · {album.tracks.length} tracks
            {album.year ? ` · ${album.year}` : ""}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {(Object.keys(CHECK_LABELS) as (keyof AlbumChecks)[]).map((key) => (
              <CheckPill
                key={key}
                label={CHECK_LABELS[key]}
                check={album.checks[key]}
                onClick={key === "tracklist" && canCompare ? () => setComparing((prev) => !prev) : undefined}
                expanded={key === "tracklist" ? comparing : undefined}
              />
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
      {comparing && <ReleaseComparisonPanel album={album} />}
      {expanded && <InboxAlbumDetails album={album} disabled={disabled} onConvert={onConvert} />}
    </div>
  );
};
