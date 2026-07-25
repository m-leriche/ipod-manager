import { formatDuration } from "../../../utils/format";
import { trackNote } from "./compare";
import type { ComparisonRow } from "./types";

/**
 * One line of the release tracklist. A file you don't have is dimmed rather
 * than labelled — the absence is the message, and the header carries the count.
 */
export const ComparisonTrackRow = ({ row }: { row: ComparisonRow }) => {
  const { local, mb } = row;
  const missing = mb !== null && local === null;
  const title = mb?.title ?? local?.title ?? local?.file_name ?? "";
  const note = trackNote(row);
  const secs = mb?.length_ms != null ? mb.length_ms / 1000 : (local?.duration_secs ?? null);

  return (
    <div
      className={`flex items-center gap-3 h-7 px-2 -mx-2 rounded-md hover:bg-bg-hover transition-colors ${
        missing ? "opacity-40" : ""
      }`}
    >
      <span className="w-5 text-right text-[11px] text-text-tertiary shrink-0 tabular-nums">
        {mb?.position ?? local?.track_number ?? "–"}
      </span>
      <span className="flex-1 min-w-0 truncate text-[11px] text-text-secondary" title={title}>
        {title}
      </span>
      {/* Uncapped so a long tag reads in full; it only truncates once the row
          genuinely runs out of room, and the tooltip covers that case. */}
      {note && (
        <span className="min-w-0 truncate text-[10px] text-text-tertiary" title={note}>
          {note}
        </span>
      )}
      <span className="w-10 text-right text-[11px] text-text-tertiary shrink-0 tabular-nums">
        {secs !== null ? formatDuration(secs) : "–"}
      </span>
    </div>
  );
};
