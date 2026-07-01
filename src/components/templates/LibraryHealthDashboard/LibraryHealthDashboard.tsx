import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LibraryTrack } from "../../../types/library";
import type { HealthReport, HealthIssue, Phase } from "./types";
import { HealthDetailModal } from "./HealthDetailModal";
import { HealthSummary } from "./HealthSummary";
import { HealthCard } from "./HealthCard";

const INFORMATIONAL = new Set(["never_played", "unrated"]);

const groupIssues = (issues: HealthIssue[]) =>
  [
    { label: "Metadata", issues: issues.filter((i) => i.id.startsWith("missing_")) },
    { label: "Audio Quality", issues: issues.filter((i) => i.id === "low_bitrate") },
    {
      label: "Library",
      issues: issues.filter((i) => !i.id.startsWith("missing_") && i.id !== "low_bitrate"),
    },
  ].filter((group) => group.issues.length > 0);

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

  const attentionCount = report.issues.filter((i) => i.count > 0 && !INFORMATIONAL.has(i.id)).length;
  const groups = groupIssues(report.issues);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto gap-5">
      <HealthSummary totalTracks={report.total_tracks} attentionCount={attentionCount} onRefresh={load} />

      {groups.map((group) => (
        <section key={group.label}>
          <h3 className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest mb-2.5">{group.label}</h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {group.issues.map((issue) => (
              <HealthCard key={issue.id} issue={issue} totalTracks={report.total_tracks} onSelect={setActiveIssue} />
            ))}
          </div>
        </section>
      ))}

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
