import { useMemo } from "react";
import { TOOL_GROUPS } from "./constants";
import type { ToolTab } from "./types";

interface ToolTabBarProps {
  active: ToolTab;
  onSelect: (tab: ToolTab) => void;
}

export const ToolTabBar = ({ active, onSelect }: ToolTabBarProps) => {
  const activeGroup = useMemo(
    () => TOOL_GROUPS.find((group) => group.tabs.some((tab) => tab.id === active)) ?? TOOL_GROUPS[0],
    [active],
  );

  return (
    <div className="flex flex-col gap-3 shrink-0">
      <div
        role="tablist"
        aria-label="Tool categories"
        className="inline-flex self-start gap-0.5 p-0.5 bg-bg-card/40 border border-border rounded-lg"
      >
        {TOOL_GROUPS.map((group) => {
          const selected = group.label === activeGroup.label;
          return (
            <button
              key={group.label}
              role="tab"
              aria-selected={selected}
              onClick={() => onSelect(group.tabs[0].id)}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                selected ? "bg-bg-card text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              {group.label}
            </button>
          );
        })}
      </div>

      <div role="tablist" aria-label={`${activeGroup.label} tools`} className="flex items-center gap-1.5">
        {activeGroup.tabs.map((tab) => {
          const selected = active === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={selected}
              onClick={() => onSelect(tab.id)}
              title={tab.description}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                selected
                  ? "bg-bg-card text-text-primary border border-border-active"
                  : "text-text-tertiary border border-transparent hover:text-text-secondary"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
