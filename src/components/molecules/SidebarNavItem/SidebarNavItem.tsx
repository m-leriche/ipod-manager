interface SidebarNavItemProps {
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
  count?: number;
  role?: "tab";
}

export const SidebarNavItem = ({ label, icon, isActive, onClick, count, role }: SidebarNavItemProps) => (
  <button
    onClick={onClick}
    role={role}
    aria-selected={role === "tab" ? isActive : undefined}
    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-all ${
      isActive
        ? "bg-bg-card text-text-primary border border-border-active"
        : "text-text-secondary border border-transparent hover:text-text-primary hover:bg-bg-hover"
    }`}
  >
    <span className="w-4 h-4 flex items-center justify-center shrink-0 opacity-70">{icon}</span>
    <span className="flex-1 text-left truncate">{label}</span>
    {count !== undefined && (
      <span className="text-[10px] text-text-tertiary tabular-nums">{count.toLocaleString()}</span>
    )}
  </button>
);
