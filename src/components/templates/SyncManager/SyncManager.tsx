import { useState } from "react";
import { ComparisonView } from "../ComparisonView/ComparisonView";
import { SplitComparisonView } from "../SplitComparisonView/SplitComparisonView";
import { FolderPicker } from "../../atoms/FolderPicker/FolderPicker";
import { FilterPanel } from "../../organisms/FilterPanel/FilterPanel";
import { pickFolder } from "../../../utils/pickPath";
import type { SyncManagerProps } from "./types";

export const SyncManager = ({
  sourcePath,
  targetPath,
  exclusions,
  onSourcePathChange,
  onTargetPathChange,
  onExclusionsChange,
}: SyncManagerProps) => {
  const [comparing, setComparing] = useState(false);
  const [viewMode, setViewMode] = useState<"tree" | "split">("split");
  const [showFilters, setShowFilters] = useState(false);

  const addExclusion = (path: string) => {
    if (exclusions.includes(path)) return;
    onExclusionsChange([...exclusions, path]);
  };

  const removeExclusion = (path: string) => {
    onExclusionsChange(exclusions.filter((e) => e !== path));
  };

  const browse = async (setter: (path: string) => void, title: string) => {
    const path = await pickFolder(title);
    if (path) setter(path);
  };

  if (comparing && sourcePath && targetPath) {
    return (
      <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
        {/* View mode toggle */}
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => setViewMode("tree")}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all ${
              viewMode === "tree"
                ? "bg-bg-card text-text-primary border-border-active"
                : "bg-transparent text-text-tertiary border-transparent hover:text-text-secondary"
            }`}
          >
            Tree
          </button>
          <button
            onClick={() => setViewMode("split")}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all ${
              viewMode === "split"
                ? "bg-bg-card text-text-primary border-border-active"
                : "bg-transparent text-text-tertiary border-transparent hover:text-text-secondary"
            }`}
          >
            Split
          </button>
        </div>

        {viewMode === "tree" ? (
          <ComparisonView
            sourcePath={sourcePath}
            targetPath={targetPath}
            exclusions={exclusions}
            onAddExclusion={addExclusion}
            onBack={() => setComparing(false)}
          />
        ) : (
          <SplitComparisonView
            sourcePath={sourcePath}
            targetPath={targetPath}
            exclusions={exclusions}
            onAddExclusion={addExclusion}
            onBack={() => setComparing(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
      {showFilters && exclusions.length > 0 && <FilterPanel exclusions={exclusions} onRemove={removeExclusion} />}

      <FolderPicker
        label="Source"
        path={sourcePath}
        onBrowse={() => browse(onSourcePathChange, "Select source folder")}
      />
      <FolderPicker
        label="Target"
        path={targetPath}
        onBrowse={() => browse(onTargetPathChange, "Select target folder")}
      />

      <div className="flex items-center gap-2 justify-end shrink-0">
        {exclusions.length > 0 && (
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
              showFilters
                ? "bg-accent/10 border-accent/30 text-accent"
                : "bg-bg-card border-border text-text-tertiary hover:text-text-secondary hover:border-border-active"
            }`}
          >
            Filters ({exclusions.length})
          </button>
        )}
        <button
          disabled={!sourcePath || !targetPath}
          onClick={() => setComparing(true)}
          className="px-5 py-2.5 bg-text-primary text-bg-primary rounded-xl text-xs font-medium transition-all hover:not-disabled:opacity-90 disabled:opacity-20 disabled:cursor-not-allowed"
        >
          Compare Folders
        </button>
      </div>
    </div>
  );
};
