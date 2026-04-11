export const StatusDot = ({ active }: { active: boolean }) => (
  <span
    className={`w-1.5 h-1.5 rounded-full ${active ? "bg-success shadow-[0_0_6px_var(--color-success)]" : "bg-danger shadow-[0_0_6px_var(--color-danger)]"}`}
  />
);
