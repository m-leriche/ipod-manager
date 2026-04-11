import type { PillProps } from "./types";

export const Pill = ({ children, onClick }: PillProps) => (
  <button
    onClick={onClick}
    className="px-2.5 py-1 rounded-lg text-[10px] font-medium text-text-tertiary hover:text-text-secondary transition-all"
  >
    {children}
  </button>
);
