import type { PillProps } from "./types";

export const Pill = ({ children, onClick }: PillProps) => (
  <button
    onClick={onClick}
    className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-text-tertiary hover:text-text-secondary transition-all"
  >
    {children}
  </button>
);
