import type { Filter } from "./types";

export const STATUS_ICON: Record<string, string> = {
  source_only: "\u2192",
  target_only: "\u2190",
  modified: "\u2260",
  same: "=",
};

export const STATUS_BADGE: Record<string, string> = {
  source_only: "bg-success/15 text-success",
  target_only: "bg-danger/15 text-danger",
  modified: "bg-warning/15 text-warning",
  same: "bg-text-tertiary/10 text-text-tertiary",
};

export const STATUS_LABEL: Record<string, string> = {
  source_only: "new",
  target_only: "extra",
  modified: "modified",
  same: "matching",
};

export const STATUS_COLOR: Record<string, string> = {
  source_only: "text-success",
  target_only: "text-danger",
  modified: "text-warning",
  same: "text-text-tertiary",
};

export const FILE_ROW_BG: Record<string, string> = {
  source_only: "bg-success/[0.03] hover:bg-success/[0.07]",
  target_only: "bg-danger/[0.03] hover:bg-danger/[0.07]",
  modified: "bg-warning/[0.03] hover:bg-warning/[0.07]",
  same: "opacity-40",
};

export const FILTERS: { key: Filter; label: string }[] = [
  { key: "differences", label: "Differences" },
  { key: "all", label: "All" },
  { key: "source_only", label: "New" },
  { key: "target_only", label: "Extra" },
  { key: "modified", label: "Modified" },
  { key: "same", label: "Matching" },
];
