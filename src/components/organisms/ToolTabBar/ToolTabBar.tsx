import { TOOL_GROUPS } from "./constants";
import type { ToolTab } from "./types";

interface ToolTabBarProps {
  active: ToolTab;
  onSelect: (tab: ToolTab) => void;
}

const ToolTabButton = ({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) => (
  <button
    role="tab"
    aria-selected={active}
    onClick={onClick}
    title={title}
    className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
      active
        ? "bg-bg-card text-text-primary border border-border-active"
        : "text-text-tertiary border border-transparent hover:text-text-secondary"
    }`}
  >
    {children}
  </button>
);

export const ToolTabBar = ({ active, onSelect }: ToolTabBarProps) => (
  <div className="flex items-center gap-2 shrink-0 flex-wrap" role="tablist" aria-label="Tool tabs">
    {TOOL_GROUPS.map((group, index) => (
      <div key={group.label} className="flex items-center gap-1.5">
        {index > 0 && <span aria-hidden="true" className="w-px h-5 bg-border mx-1" />}
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary/70 mr-0.5">
          {group.label}
        </span>
        {group.tabs.map((tab) => (
          <ToolTabButton
            key={tab.id}
            active={active === tab.id}
            onClick={() => onSelect(tab.id)}
            title={tab.description}
          >
            {tab.label}
          </ToolTabButton>
        ))}
      </div>
    ))}
  </div>
);
