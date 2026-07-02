import { useState } from "react";
import { ComparisonView } from "../ComparisonView/ComparisonView";
import { SplitComparisonView } from "../SplitComparisonView/SplitComparisonView";
import { FolderPicker } from "../../atoms/FolderPicker/FolderPicker";
import { pickFolder } from "../../../utils/pickPath";
import type { SyncManagerProps } from "./types";

export const SyncManager = ({
  sourcePath,
  targetPath,
  exclusions,
  transcodeLossless,
  transcodeBitrate,
  onSourcePathChange,
  onTargetPathChange,
  onExclusionsChange,
  onTranscodeLosslessChange,
  onTranscodeBitrateChange,
}: SyncManagerProps) => {
  const [comparing, setComparing] = useState(false);
  const [viewMode, setViewMode] = useState<"tree" | "split">("split");

  const transcode = transcodeLossless ? transcodeBitrate : null;

  const addExclusion = (path: string) => {
    if (exclusions.includes(path)) return;
    onExclusionsChange([...exclusions, path]);
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
            transcode={transcode}
            onAddExclusion={addExclusion}
            onBack={() => setComparing(false)}
          />
        ) : (
          <SplitComparisonView
            sourcePath={sourcePath}
            targetPath={targetPath}
            exclusions={exclusions}
            transcode={transcode}
            onAddExclusion={addExclusion}
            onBack={() => setComparing(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
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

      {/* Transcode options */}
      <div className="flex items-center gap-3 bg-bg-secondary border border-border rounded-xl px-4 py-2.5">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={transcodeLossless}
            onChange={(e) => onTranscodeLosslessChange(e.target.checked)}
            className="w-3 h-3 cursor-pointer accent-accent rounded"
          />
          <span className="text-xs font-medium text-text-secondary">Convert lossless to MP3</span>
        </label>
        <span className="flex-1 min-w-0 text-[11px] text-text-tertiary truncate">
          FLAC, WAV and AIFF files are transcoded during sync so the target holds more music
        </span>
        {transcodeLossless && (
          <select
            aria-label="MP3 quality"
            value={transcodeBitrate}
            onChange={(e) => onTranscodeBitrateChange(e.target.value as typeof transcodeBitrate)}
            className="bg-bg-card border border-border text-text-secondary rounded-lg px-2 py-1.5 text-[11px] font-medium shrink-0 cursor-pointer"
          >
            <option value="320">320 kbps CBR</option>
            <option value="v0">V0 VBR</option>
          </select>
        )}
      </div>

      <div className="flex justify-end shrink-0">
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
