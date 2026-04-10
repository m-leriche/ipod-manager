import { useState } from "react";
import { FileExplorer } from "./FileExplorer";
import { ComparisonView } from "./ComparisonView";

const IPOD_ROOT = "/Volumes/IPOD";

export function SyncManager() {
  const [comparing, setComparing] = useState(false);
  const [sourceFolder, setSourceFolder] = useState<string | null>(null);
  const [targetFolder, setTargetFolder] = useState<string | null>(null);

  if (comparing && sourceFolder && targetFolder) {
    return (
      <div className="flex-1 min-w-0 flex flex-col gap-2.5 min-h-0">
        <ComparisonView sourcePath={sourceFolder} targetPath={targetFolder} onBack={() => setComparing(false)} />
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-2.5 min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-3 bg-bg-secondary border border-border rounded-2xl px-4 py-2.5 shrink-0">
        <PathDisplay label="Source" path={sourceFolder} placeholder="Select folder on left" />
        <button
          disabled={!sourceFolder || !targetFolder}
          onClick={() => setComparing(true)}
          className="px-5 py-2 bg-text-primary text-bg-primary rounded-xl text-xs font-medium shrink-0 transition-all hover:not-disabled:opacity-90 disabled:opacity-20 disabled:cursor-not-allowed"
        >
          Compare Folders
        </button>
        <PathDisplay label="iPod" path={targetFolder} placeholder="Select folder on right" />
      </div>

      {/* Dual Explorer */}
      <div className="flex gap-2.5 flex-1 min-h-0">
        <FileExplorer rootPath="/Volumes" rootLabel="Volumes" allowParentNavigation onSelectFolder={setSourceFolder} selectedFolder={sourceFolder} />
        <FileExplorer rootPath={IPOD_ROOT} rootLabel="IPOD" onSelectFolder={setTargetFolder} selectedFolder={targetFolder} />
      </div>
    </div>
  );
}

function PathDisplay({ label, path, placeholder }: { label: string; path: string | null; placeholder: string }) {
  return (
    <div className="flex-1 min-w-0 flex items-center gap-2">
      <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest shrink-0">{label}</span>
      <span className={`text-[11px] overflow-hidden text-ellipsis whitespace-nowrap ${path ? "text-text-secondary font-medium" : "text-text-tertiary italic"}`}>
        {path ?? placeholder}
      </span>
    </div>
  );
}
