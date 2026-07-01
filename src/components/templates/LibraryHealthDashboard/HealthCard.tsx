import { issuePercentage, issueSeverity } from "./helpers";
import type { HealthIssue } from "./types";

const SEVERITY = {
  critical: { text: "text-danger", bar: "bg-danger" },
  warning: { text: "text-warning", bar: "bg-warning" },
  ok: { text: "text-text-tertiary", bar: "bg-text-tertiary/30" },
} as const;

interface HealthCardProps {
  issue: HealthIssue;
  totalTracks: number;
  onSelect: (issue: HealthIssue) => void;
}

export const HealthCard = ({ issue, totalTracks, onSelect }: HealthCardProps) => {
  const severity = issueSeverity(issue, totalTracks);
  const clickable = issue.count > 0;
  const styles = SEVERITY[severity];
  const pct = totalTracks > 0 ? Math.min(100, (issue.count / totalTracks) * 100) : 0;

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => onSelect(issue)}
      className={`group text-left bg-bg-card border border-border rounded-xl px-4 py-3.5 flex flex-col ${
        clickable ? "cursor-pointer hover:border-border-active hover:bg-bg-hover transition-all" : "opacity-60"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-text-secondary truncate">{issue.label}</span>
        {clickable ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            className="w-3.5 h-3.5 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            className="w-3.5 h-3.5 text-success/70 shrink-0"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <div className="flex items-baseline gap-1.5 mt-2">
        <span className={`text-2xl font-semibold tabular-nums ${styles.text}`}>{issue.count.toLocaleString()}</span>
        <span className="text-[10px] text-text-tertiary">{issuePercentage(issue.count, totalTracks)}</span>
      </div>
      <div className="mt-2.5 h-1 rounded-full bg-bg-primary overflow-hidden">
        <div className={`h-full rounded-full ${styles.bar}`} style={{ width: `${pct}%` }} />
      </div>
    </button>
  );
};
