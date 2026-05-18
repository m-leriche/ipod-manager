import { useMemo, useState } from "react";
import { issueKey, severityColor, fieldLabel } from "./helpers";
import type { TrackMatch, TrackIssue } from "./types";

interface RepairTrackRowProps {
  trackMatch: TrackMatch;
  acceptedFixes: Set<string>;
  onToggleFix: (key: string) => void;
}

interface DiffField {
  field: string;
  label: string;
  localValue: string;
  mbValue: string;
  issue: TrackIssue | null;
}

/** Build a list of metadata fields showing local vs MusicBrainz values. */
const buildDiffFields = (trackMatch: TrackMatch): DiffField[] => {
  const local = trackMatch.local_track;
  const mb = trackMatch.mb_track;
  const issuesByField = new Map<string, TrackIssue>();
  for (const issue of trackMatch.issues) {
    issuesByField.set(issue.field, issue);
  }

  const fields: DiffField[] = [];

  const addField = (field: string, localVal: string | number | null, mbVal: string | null) => {
    const issue = issuesByField.get(field) ?? null;
    const localStr = localVal != null ? String(localVal) : "";
    const mbStr = issue?.suggested_value ?? mbVal ?? "";
    // Only include fields that have at least one value or an issue
    if (localStr || mbStr || issue) {
      fields.push({
        field,
        label: fieldLabel(field),
        localValue: localStr,
        mbValue: mbStr,
        issue,
      });
    }
  };

  addField("title", local.title, mb?.title ?? null);
  addField("artist", local.artist, mb?.artist ?? null);
  addField("album", local.album, null);
  addField("album_artist", local.album_artist, null);
  addField("track", local.track, mb ? String(mb.position) : null);
  addField("track_total", local.track_total, null);
  addField("year", local.year, null);
  addField("genre", local.genre, null);
  addField("sort_artist", local.sort_artist, null);
  addField("sort_album_artist", local.sort_album_artist, null);

  return fields;
};

export const RepairTrackRow = ({ trackMatch, acceptedFixes, onToggleFix }: RepairTrackRowProps) => {
  const local = trackMatch.local_track;
  const mb = trackMatch.mb_track;
  const fileName = local.file_name;
  const [expanded, setExpanded] = useState(trackMatch.issues.length > 0);

  const diffFields = useMemo(() => buildDiffFields(trackMatch), [trackMatch]);
  const issueFields = diffFields.filter((f) => f.issue !== null);
  const matchingFields = diffFields.filter((f) => f.issue === null);

  return (
    <div className="border-b border-border last:border-b-0">
      {/* Track header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-bg-primary/50 hover:bg-bg-hover/50 transition-colors text-left"
      >
        <span className="text-[10px] text-text-tertiary w-4 shrink-0">{expanded ? "\u25BE" : "\u25B8"}</span>
        <span className="text-[11px] text-text-tertiary w-6 text-right shrink-0">{local.track ?? "?"}</span>
        <span className="text-xs text-text-primary font-medium truncate flex-1">{local.title || fileName}</span>
        {trackMatch.issues.length > 0 && (
          <span className="text-[10px] text-text-tertiary shrink-0">
            {trackMatch.issues.length} {trackMatch.issues.length === 1 ? "diff" : "diffs"}
          </span>
        )}
        {mb && <span className="text-[10px] text-text-tertiary shrink-0">#{mb.position}</span>}
        {!mb && <span className="text-[10px] text-danger shrink-0">no match</span>}
      </button>

      {/* Side-by-side diff table */}
      {expanded && (
        <div className="px-3 pb-2">
          {issueFields.length > 0 && (
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="text-[10px] text-text-tertiary uppercase tracking-widest">
                  <th className="w-5 py-1" />
                  <th className="text-left py-1 font-medium pl-1">Field</th>
                  <th className="text-left py-1 font-medium">Current</th>
                  <th className="w-4 py-1" />
                  <th className="text-left py-1 font-medium">MusicBrainz</th>
                </tr>
              </thead>
              <tbody>
                {issueFields.map((df) => (
                  <DiffRow
                    key={df.field}
                    diff={df}
                    accepted={df.issue ? acceptedFixes.has(issueKey(df.issue)) : false}
                    onToggle={df.issue ? () => onToggleFix(issueKey(df.issue!)) : undefined}
                  />
                ))}
              </tbody>
            </table>
          )}

          {/* Matching fields (collapsed summary) */}
          {matchingFields.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 pl-6">
              {matchingFields.map((df) => (
                <span key={df.field} className="text-[10px] text-text-tertiary">
                  {df.label}: <span className="text-text-secondary">{df.localValue || "\u2014"}</span>
                </span>
              ))}
            </div>
          )}

          {trackMatch.issues.length === 0 && <div className="text-[10px] text-success pl-6 py-1">All fields match</div>}
        </div>
      )}
    </div>
  );
};

const DiffRow = ({ diff, accepted, onToggle }: { diff: DiffField; accepted: boolean; onToggle?: () => void }) => {
  const hasSuggestion = diff.issue?.suggested_value != null;
  const severity = diff.issue?.severity;

  return (
    <tr className="group">
      <td className="py-0.5 align-middle">
        {hasSuggestion && onToggle ? (
          <input type="checkbox" checked={accepted} onChange={onToggle} className="accent-accent cursor-pointer" />
        ) : (
          <span className="block w-[13px]" />
        )}
      </td>
      <td className={`py-0.5 pl-1 font-medium ${severity ? severityColor(severity) : "text-text-tertiary"}`}>
        {diff.label}
      </td>
      <td className="py-0.5 text-text-secondary">
        {diff.localValue ? (
          <span className={hasSuggestion ? "line-through opacity-60" : ""}>{diff.localValue}</span>
        ) : (
          <span className="text-text-tertiary italic">{"\u2014"}</span>
        )}
      </td>
      <td className="py-0.5 text-center text-text-tertiary">{hasSuggestion ? "\u2192" : ""}</td>
      <td className="py-0.5 font-medium text-text-primary">
        {diff.mbValue || <span className="text-text-tertiary italic">{"\u2014"}</span>}
      </td>
    </tr>
  );
};
