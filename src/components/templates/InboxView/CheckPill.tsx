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

interface CheckPillProps {
  label: string;
  check: CheckResult;
  /** When set the pill becomes a toggle for a detail panel. */
  onClick?: () => void;
  expanded?: boolean;
}

export const CheckPill = ({ label, check, onClick, expanded }: CheckPillProps) => {
  const className = `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_STYLES[check.status]}`;
  const content = (
    <>
      {STATUS_GLYPHS[check.status]} {label}
    </>
  );

  if (!onClick) {
    return (
      <span title={check.detail ?? undefined} className={className}>
        {content}
      </span>
    );
  }

  return (
    <button
      onClick={onClick}
      title={check.detail ?? undefined}
      aria-expanded={expanded}
      className={`${className} hover:brightness-125 transition-all cursor-pointer`}
    >
      {content}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        className={`w-2 h-2 transition-transform ${expanded ? "rotate-90" : ""}`}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
      </svg>
    </button>
  );
};
