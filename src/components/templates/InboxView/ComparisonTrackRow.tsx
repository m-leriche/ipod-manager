import { formatDuration } from "../../../utils/format";
import type { ComparisonRow } from "./types";

/** Tag durations that disagree by more than this — usually a different mix. */
const DURATION_TOLERANCE_SECS = 5;

export const ComparisonTrackRow = ({ row }: { row: ComparisonRow }) => {
  const { local, mb } = row;
  const number = mb?.position ?? local?.track_number ?? null;
  const mbSecs = mb?.length_ms != null ? mb.length_ms / 1000 : null;
  const drifted = local != null && mbSecs != null && Math.abs(local.duration_secs - mbSecs) > DURATION_TOLERANCE_SECS;

  return (
    <div className="flex items-center gap-3 text-[11px] py-0.5">
      <span className="w-5 text-right text-text-tertiary shrink-0 tabular-nums">{number ?? "–"}</span>
      <span className={`flex-1 min-w-0 truncate ${local ? "text-text-secondary" : "text-text-tertiary italic"}`}>
        {local ? (local.title ?? local.file_name) : "Missing"}
      </span>
      <span className={`flex-1 min-w-0 truncate ${mb ? "text-text-secondary" : "text-text-tertiary italic"}`}>
        {mb ? mb.title : "Not on this release"}
      </span>
      <span
        className={`w-14 text-right shrink-0 tabular-nums ${drifted ? "text-warning" : "text-text-tertiary"}`}
        title={drifted && local ? `Your file: ${formatDuration(local.duration_secs)}` : undefined}
      >
        {mbSecs != null ? formatDuration(mbSecs) : local ? formatDuration(local.duration_secs) : "–"}
      </span>
    </div>
  );
};
