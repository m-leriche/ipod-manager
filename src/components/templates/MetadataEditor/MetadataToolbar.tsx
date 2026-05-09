import type { View, RepairReport, IdentifyResult } from "./types";
import type { TrackMetadata } from "../../../types/metadata";

interface MetadataToolbarProps {
  scanPath: string;
  trackCount: number;
  phase: string;
  view: View;
  onViewChange: (view: View) => void;
  onBrowse: () => void;
  onRescan: () => void;
  // Edit view
  dirtyCount: number;
  // Repair
  repairReport: RepairReport | null;
  onStartRepair: () => void;
  repairTotalAccepted: number;
  onClearAllRepairs: () => void;
  onApplyRepairs: () => void;
  onAcceptAllRepairs: () => void;
  // Quality
  hasQualityResults: boolean;
  onStartQualityScan: () => void;
  // Identify
  identifyResults: IdentifyResult[] | null;
  onStartIdentify: (filePaths: string[]) => void;
  identifyChosenCount: number;
  identifyMatchedCount: number;
  onAutoSelectBest: () => void;
  onClearAllIdentify: () => void;
  onApplyIdentify: () => void;
  tracks: TrackMetadata[];
}

export const MetadataToolbar = ({
  scanPath,
  trackCount,
  phase,
  view,
  onViewChange,
  onBrowse,
  onRescan,
  dirtyCount,
  repairReport,
  onStartRepair,
  repairTotalAccepted,
  onClearAllRepairs,
  onApplyRepairs,
  onAcceptAllRepairs,
  hasQualityResults,
  onStartQualityScan,
  identifyResults,
  onStartIdentify,
  identifyChosenCount,
  identifyMatchedCount,
  onAutoSelectBest,
  onClearAllIdentify,
  onApplyIdentify,
  tracks,
}: MetadataToolbarProps) => {
  const isSaving = phase === "saving";
  const hasViewTabs = repairReport || hasQualityResults || identifyResults;

  return (
    <div className="flex items-center gap-3 bg-bg-secondary border border-border rounded-2xl px-5 py-3 shrink-0">
      <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-widest shrink-0">Folder</span>
      <span className="flex-1 min-w-0 text-xs text-text-secondary font-medium truncate">{scanPath}</span>
      <span className="text-[11px] text-text-tertiary shrink-0">{trackCount} tracks</span>
      <button
        onClick={onBrowse}
        disabled={isSaving}
        className="px-3 py-1.5 bg-bg-card border border-border text-text-tertiary rounded-lg text-xs shrink-0 hover:not-disabled:text-text-secondary hover:not-disabled:border-border-active disabled:opacity-30 transition-all"
      >
        Browse
      </button>
      <button
        onClick={onRescan}
        disabled={isSaving}
        className="px-3 py-1.5 bg-bg-card border border-border text-text-tertiary rounded-lg text-xs shrink-0 hover:not-disabled:text-text-secondary hover:not-disabled:border-border-active disabled:opacity-30 transition-all"
      >
        ↻ Rescan
      </button>

      {/* View tabs */}
      {hasViewTabs && (
        <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
          <ViewTab label="Edit" active={view === "edit"} onClick={() => onViewChange("edit")} />
          {repairReport && <ViewTab label="Repair" active={view === "repair"} onClick={() => onViewChange("repair")} />}
          {hasQualityResults && (
            <ViewTab label="Quality" active={view === "quality"} onClick={() => onViewChange("quality")} />
          )}
          {identifyResults && (
            <ViewTab label="Identify" active={view === "identify"} onClick={() => onViewChange("identify")} />
          )}
        </div>
      )}

      {/* Edit view: scan action buttons */}
      {!isSaving && view === "edit" && (
        <div className="flex gap-1.5 shrink-0">
          {!repairReport && <ActionButton onClick={onStartRepair}>Repair with MusicBrainz</ActionButton>}
          {!hasQualityResults && <ActionButton onClick={onStartQualityScan}>Quality Scan</ActionButton>}
          {!identifyResults && (
            <ActionButton onClick={() => onStartIdentify(tracks.map((t) => t.file_path))}>
              Identify with AcoustID
            </ActionButton>
          )}
        </div>
      )}

      {/* Edit view: dirty count */}
      {view === "edit" && dirtyCount > 0 && (
        <span className="text-[11px] font-medium text-accent shrink-0">
          {dirtyCount} unsaved {dirtyCount === 1 ? "change" : "changes"}
        </span>
      )}

      {/* Repair view: apply/clear */}
      {view === "repair" && repairTotalAccepted > 0 && (
        <>
          <ActionButton onClick={onClearAllRepairs}>Clear All</ActionButton>
          <button
            onClick={onApplyRepairs}
            className="px-3 py-1.5 bg-text-primary text-bg-primary rounded-lg text-[11px] font-medium shrink-0 hover:opacity-90 transition-all"
          >
            Apply {repairTotalAccepted} {repairTotalAccepted === 1 ? "Fix" : "Fixes"}
          </button>
        </>
      )}
      {view === "repair" &&
        repairTotalAccepted === 0 &&
        repairReport &&
        repairReport.total_issues.error_count +
          repairReport.total_issues.warning_count +
          repairReport.total_issues.info_count >
          0 && <ActionButton onClick={onAcceptAllRepairs}>Accept All Fixes</ActionButton>}

      {/* Identify view: auto-select/apply */}
      {view === "identify" && identifyResults && (
        <>
          {identifyChosenCount === 0 && identifyMatchedCount > 0 && (
            <ActionButton onClick={onAutoSelectBest}>Auto-Select Best</ActionButton>
          )}
          {identifyChosenCount > 0 && (
            <>
              <ActionButton onClick={onClearAllIdentify}>Clear All</ActionButton>
              <button
                onClick={onApplyIdentify}
                className="px-3 py-1.5 bg-text-primary text-bg-primary rounded-lg text-[11px] font-medium shrink-0 hover:opacity-90 transition-all"
              >
                Apply {identifyChosenCount} {identifyChosenCount === 1 ? "Tag" : "Tags"}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
};

const ViewTab = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1.5 text-[11px] font-medium transition-all ${
      active ? "bg-bg-card text-text-primary" : "text-text-tertiary hover:text-text-secondary"
    }`}
  >
    {label}
  </button>
);

const ActionButton = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className="px-3 py-1.5 bg-bg-card border border-border text-text-secondary rounded-lg text-[11px] font-medium shrink-0 hover:text-text-primary hover:border-border-active transition-all"
  >
    {children}
  </button>
);
