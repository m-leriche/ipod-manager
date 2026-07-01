import { SidebarNavItem } from "../../molecules/SidebarNavItem/SidebarNavItem";
import { TOOL_GROUPS } from "./constants";
import { TOOL_ICONS } from "./icons";
import type { ToolTab } from "./types";

interface ToolsSidebarProps {
  active: ToolTab;
  onSelect: (tab: ToolTab) => void;
}

export const ToolsSidebar = ({ active, onSelect }: ToolsSidebarProps) => (
  <nav
    aria-label="Tools"
    className="w-[200px] shrink-0 border-r border-border flex flex-col bg-bg-secondary py-3 overflow-y-auto"
  >
    {TOOL_GROUPS.map((group) => (
      <div key={group.label} className="px-3 mb-3 last:mb-0">
        <div className="text-[9px] font-medium uppercase tracking-widest text-text-tertiary px-3 mb-1.5">
          {group.label}
        </div>
        <div className="flex flex-col gap-0.5">
          {group.tabs.map((tab) => (
            <SidebarNavItem
              key={tab.id}
              role="tab"
              label={tab.label}
              icon={TOOL_ICONS[tab.id]}
              isActive={active === tab.id}
              onClick={() => onSelect(tab.id)}
            />
          ))}
        </div>
      </div>
    ))}
  </nav>
);
