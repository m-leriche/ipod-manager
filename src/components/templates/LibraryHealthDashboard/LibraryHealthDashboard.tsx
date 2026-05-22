import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LibraryTrack } from "../../../types/library";
import type { HealthReport, HealthIssue, Phase } from "./types";
import { issuePercentage, issueSeverity } from "./helpers";
import { HealthDetailModal } from "./HealthDetailModal";

interface LibraryHealthDashboardProps {
  onRepairMetadata?: (tracks: LibraryTrack[]) => void;
}

export const LibraryHealthDashboard = ({ onRepairMetadata }: LibraryHealthDashboardProps) => {
  const [phase, setPhase] = useState<Phase>("idle");
  const [report, setReport] = useState<HealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeIssue, setActiveIssue] = useState<HealthIssue | null>(null);

  const load = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      const data = await invoke<HealthReport>("get_library_health");
      setReport(data);
      setPhase("loaded");
    } catch (e) {
      setError(`${e}`);
      setPhase("idle");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (phase === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-text-tertiary text-xs">Analyzing library health...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-danger text-xs mb-3">{error}</p>
          <button
            onClick={load}
            className="px-3 py-1.5 bg-bg-card border border-border text-text-secondary rounded-lg text-[11px] font-medium hover:text-text-primary hover:border-border-active transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const allClear = !report.issues.some((i) => i.count > 0 && i.id !== "never_played" && i.id !== "unrated");

  const missingIssues = report.issues.filter((i) => i.id.startsWith("missing_"));
  const otherIssues = report.issues.filter((i) => !i.id.startsWith("missing_"));
  const otherMid = Math.ceil(otherIssues.length / 2);

  const renderCard = (issue: HealthIssue) => {
    const severity = issueSeverity(issue, report.total_tracks);
    const clickable = issue.count > 0;
    return (
      <div
        key={issue.id}
        onClick={clickable ? () => setActiveIssue(issue) : undefined}
        className={`bg-bg-card border rounded-xl px-4 py-3 ${
          severity === "critical" ? "border-danger/30" : severity === "warning" ? "border-warning/30" : "border-border"
        } ${clickable ? "cursor-pointer hover:border-border-active transition-all" : ""}`}
      >
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-[11px] font-medium text-text-secondary">{issue.label}</span>
          <span
            className={`text-lg font-semibold tabular-nums ${
              severity === "critical" ? "text-danger" : severity === "warning" ? "text-warning" : "text-success"
            }`}
          >
            {issue.count.toLocaleString()}
          </span>
        </div>
        <span className="text-[10px] text-text-tertiary">
          {issuePercentage(issue.count, report.total_tracks)} of library
        </span>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest">Library Health</span>
        <span className="text-[10px] text-text-tertiary">{report.total_tracks.toLocaleString()} tracks</span>
        <div className="flex-1" />
        <button onClick={load} className="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors">
          Refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {allClear && (
          <div className="bg-success-dim border border-success/20 rounded-xl px-4 py-3 mb-4">
            <p className="text-success text-xs font-medium">Your library is healthy! No metadata issues found.</p>
          </div>
        )}

        <div className="flex gap-3">
          <div className="flex-1 flex flex-col gap-3">{missingIssues.map(renderCard)}</div>
          <div className="flex-1 flex flex-col gap-3">{otherIssues.slice(0, otherMid).map(renderCard)}</div>
          <div className="flex-1 flex flex-col gap-3">{otherIssues.slice(otherMid).map(renderCard)}</div>
        </div>
      </div>

      {activeIssue && (
        <HealthDetailModal
          issue={activeIssue}
          onClose={() => setActiveIssue(null)}
          onRepairMetadata={onRepairMetadata}
          onDataChanged={load}
        />
      )}
    </div>
  );
};
