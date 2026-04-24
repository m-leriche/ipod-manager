import { fmtBytes } from "./helpers";

interface StorageBarProps {
  audioSpace: number;
  otherSpace: number;
  freeSpace: number;
  totalSpace: number;
}

export const StorageBar = ({ audioSpace, otherSpace, freeSpace, totalSpace }: StorageBarProps) => {
  if (totalSpace === 0) return null;

  const audioPct = (audioSpace / totalSpace) * 100;
  const otherPct = (otherSpace / totalSpace) * 100;
  const freePct = (freeSpace / totalSpace) * 100;

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest">Storage</span>
        <span className="text-[10px] text-text-tertiary">{fmtBytes(totalSpace)} total</span>
      </div>

      <div className="w-full h-3 bg-bg-primary rounded-full overflow-hidden flex">
        {audioPct > 0 && (
          <div className="h-full bg-accent transition-all duration-300" style={{ width: `${audioPct}%` }} />
        )}
        {otherPct > 0 && (
          <div className="h-full bg-text-tertiary/40 transition-all duration-300" style={{ width: `${otherPct}%` }} />
        )}
        {freePct > 0 && (
          <div className="h-full bg-bg-primary transition-all duration-300" style={{ width: `${freePct}%` }} />
        )}
      </div>

      <div className="flex gap-4 mt-2.5">
        <LegendItem color="bg-accent" label="Audio" value={fmtBytes(audioSpace)} />
        <LegendItem color="bg-text-tertiary/40" label="Other" value={fmtBytes(otherSpace)} />
        <LegendItem color="bg-bg-elevated" label="Free" value={fmtBytes(freeSpace)} />
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
