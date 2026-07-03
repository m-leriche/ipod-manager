import { formatBytes } from "../../../utils/format";

interface CapacityBarProps {
  totalSpace: number;
  usedSpace: number;
  pendingBytes: number;
}

/** Storage bar showing current usage plus the projected addition from a sync. */
export const CapacityBar = ({ totalSpace, usedSpace, pendingBytes }: CapacityBarProps) => {
  if (totalSpace === 0) return null;

  const usedPct = Math.min(100, (usedSpace / totalSpace) * 100);
  const pendingPct = Math.min(100 - usedPct, (pendingBytes / totalSpace) * 100);
  const freeAfter = Math.max(0, totalSpace - usedSpace - pendingBytes);

  return (
    <div>
      <div className="w-full h-3 bg-bg-primary rounded-full overflow-hidden flex">
        {usedPct > 0 && (
          <div className="h-full bg-accent transition-all duration-300" style={{ width: `${usedPct}%` }} />
        )}
        {pendingPct > 0 && (
          <div className="h-full bg-warning transition-all duration-300" style={{ width: `${pendingPct}%` }} />
        )}
      </div>
      <div className="flex gap-4 mt-2.5">
        <LegendItem color="bg-accent" label="Used" value={formatBytes(usedSpace)} />
        <LegendItem color="bg-warning" label="To copy" value={formatBytes(pendingBytes)} />
        <LegendItem color="bg-bg-elevated" label="Free after" value={formatBytes(freeAfter)} />
      </div>
    </div>
  );
};

const LegendItem = ({ color, label, value }: { color: string; label: string; value: string }) => (
  <div className="flex items-center gap-1.5">
    <div className={`w-2 h-2 rounded-full ${color}`} />
    <span className="text-[10px] text-text-tertiary">
      {label}: <span className="text-text-secondary font-medium">{value}</span>
    </span>
  </div>
);
