import type { FormatButtonProps } from "./types";

export const FormatButton = ({ label, active, onClick }: FormatButtonProps) => (
  <button
    onClick={onClick}
    className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${
      active
        ? "bg-bg-card text-text-primary border border-border-active"
        : "text-text-tertiary border border-transparent hover:text-text-secondary"
    }`}
  >
    {label}
  </button>
);
