import type { HealthIssue } from "./types";

export const issuePercentage = (count: number, total: number): string => {
  if (total === 0) return "0%";
  return `${((count / total) * 100).toFixed(1)}%`;
};

export const issueSeverity = (issue: HealthIssue, total: number): "ok" | "warning" | "critical" => {
  if (issue.count === 0) return "ok";
  // "informational" issues that don't indicate problems
  if (issue.id === "never_played" || issue.id === "unrated") {
    const pct = issue.count / total;
    if (pct > 0.8) return "warning";
    return "ok";
  }
  const pct = issue.count / total;
  if (pct > 0.1) return "critical";
  if (issue.count > 0) return "warning";
  return "ok";
};

export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  if (i >= 3) return `${val.toFixed(2)} ${units[i]}`;
  if (i >= 1) return `${val.toFixed(1)} ${units[i]}`;
  return `${bytes} B`;
};
