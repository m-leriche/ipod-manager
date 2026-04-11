import type { FilterChipProps } from "./types";

export const FilterChip = ({ path, onRemove }: FilterChipProps) => (
  <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-bg-card border border-border rounded-lg text-[10px] text-text-secondary">
    <span className="truncate max-w-[180px]">{path}</span>
    <button
      onClick={onRemove}
      className="text-text-tertiary hover:text-danger transition-colors font-bold leading-none"
      aria-label={`Remove filter ${path}`}
    >
      &times;
    </button>
  </span>
);
