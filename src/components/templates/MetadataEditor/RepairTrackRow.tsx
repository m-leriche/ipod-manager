import { issueKey, severityColor } from "./helpers";
import type { TrackMatch, TrackIssue } from "./types";

interface RepairTrackRowProps {
  trackMatch: TrackMatch;
  acceptedFixes: Set<string>;
  onToggleFix: (key: string) => void;
}

export const RepairTrackRow = ({ trackMatch, acceptedFixes, onToggleFix }: RepairTrackRowProps) => {
  const local = trackMatch.local_track;
  const mb = trackMatch.mb_track;
  const fileName = local.file_name;

  return (
    <div className="border-b border-border last:border-b-0">
      {/* Track header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-bg-primary/50">
        <span className="text-[11px] text-text-tertiary w-6 text-right shrink-0">{local.track ?? "?"}</span>
        <span className="text-xs text-text-primary font-medium truncate flex-1">{local.title || fileName}</span>
        {mb && <span className="text-[10px] text-text-tertiary shrink-0">matched to #{mb.position}</span>}
        {!mb && <span className="text-[10px] text-text-tertiary shrink-0">no match</span>}
      </div>

      {/* Issues */}
      {trackMatch.issues.length > 0 && (
        <div className="px-3 py-1.5 space-y-1">
          {trackMatch.issues.map((issue) => (
            <IssueRow
              key={issueKey(issue)}
              issue={issue}
              accepted={acceptedFixes.has(issueKey(issue))}
              onToggle={() => onToggleFix(issueKey(issue))}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const IssueRow = ({ issue, accepted, onToggle }: { issue: TrackIssue; accepted: boolean; onToggle: () => void }) => {
  const hasSuggestion = issue.suggested_value !== null;

  return (
    <label className="flex items-start gap-2 py-0.5 cursor-pointer group">
      {hasSuggestion && (
        <input type="checkbox" checked={accepted} onChange={onToggle} className="mt-0.5 shrink-0 accent-accent" />
      )}
      {!hasSuggestion && <span className="w-[13px] shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className={`text-[11px] ${severityColor(issue.severity)}`}>{issue.description}</div>
        {hasSuggestion && issue.local_value && (
          <div className="text-[10px] text-text-tertiary mt-0.5">
            <span className="line-through">{issue.local_value}</span>
            <span className="mx-1">→</span>
            <span className="text-text-secondary">{issue.suggested_value}</span>
          </div>
        )}
      </div>
    </label>
  );
};
