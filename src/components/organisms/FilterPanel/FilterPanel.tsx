import { FilterChip } from "../../molecules/FilterChip/FilterChip";
import type { FilterPanelProps } from "./types";

export const FilterPanel = ({ exclusions, onRemove }: FilterPanelProps) => {
  if (exclusions.length === 0) {
    return (
      <div className="bg-bg-secondary border border-border rounded-2xl px-4 py-3 text-[11px] text-text-tertiary">
        No filters — right-click folders in comparison to add
      </div>
    );
  }

  return (
    <div className="bg-bg-secondary border border-border rounded-2xl px-4 py-3">
      <div className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest mb-2">Excluded Folders</div>
      <div className="flex flex-wrap gap-1.5">
        {exclusions.map((path) => (
          <FilterChip key={path} path={path} onRemove={() => onRemove(path)} />
        ))}
      </div>
    </div>
  );
};
