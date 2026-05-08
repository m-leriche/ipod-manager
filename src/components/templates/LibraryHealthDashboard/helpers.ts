import type { HealthIssue } from "./types";

export const issuePercentage = (count: number, total: number): string => {
  if (total === 0) return "0%";
  return `${((count / total) * 100).toFixed(1)}%`;
};

export const issueSeverity = (issue: HealthIssue, total: number): "ok" | "warning" | "critical" => {
  if (issue.count === 0) return "ok";
  if (issue.id === "never_played" || issue.id === "unrated") {
    return issue.count / total > 0.8 ? "warning" : "ok";
  }
  return issue.count / total > 0.1 ? "critical" : "warning";
};
