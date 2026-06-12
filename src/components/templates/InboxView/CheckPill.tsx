import type { CheckResult, CheckStatus } from "./types";

const STATUS_STYLES: Record<CheckStatus, string> = {
  pass: "bg-success/10 text-success",
  warn: "bg-warning/10 text-warning",
  fail: "bg-danger/10 text-danger",
  pending: "bg-bg-secondary text-text-tertiary",
};

const STATUS_GLYPHS: Record<CheckStatus, string> = {
  pass: "✓",
  warn: "!",
  fail: "✕",
  pending: "…",
};

export const CheckPill = ({ label, check }: { label: string; check: CheckResult }) => (
  <span
    title={check.detail ?? undefined}
    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_STYLES[check.status]}`}
  >
    {STATUS_GLYPHS[check.status]} {label}
  </span>
);
