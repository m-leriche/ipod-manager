import { Spinner } from "../../atoms/Spinner/Spinner";
import { verdictColor } from "../QualityAnalyzer/helpers";
import type { View, RepairReport, IdentifyResult } from "./types";
import type { MetadataSaveProgress, MetadataSaveResult } from "../../../types/metadata";

interface MetadataStatusBannersProps {
  view: View;
  phase: string;
  error: string | null;
  repairReport: RepairReport | null;
  identifyResults: IdentifyResult[] | null;
  identifyMatchedCount: number;
  identifyChosenCount: number;
  qualityFiles: { file_path: string }[];
  qualityCounts: { lossless: number; lossy: number; suspect: number };
  saveResult: MetadataSaveResult | null;
  saveProgress: MetadataSaveProgress | null;
  progressActive: boolean;
  canUndo: boolean;
  onCancel: () => void;
  onUndo: () => void;
}

export const MetadataStatusBanners = ({
  view,
  phase,
  error,
  repairReport,
  identifyResults,
  identifyMatchedCount,
  identifyChosenCount,
  qualityFiles,
  qualityCounts,
  saveResult,
  saveProgress,
  progressActive,
  canUndo,
  onCancel,
  onUndo,
}: MetadataStatusBannersProps) => (
  <>
    {/* Repair summary */}
    {view === "repair" && repairReport && (
      <div className="flex items-center gap-3 px-3 py-2 rounded-xl text-[11px] bg-bg-secondary border border-border shrink-0">
        {repairReport.total_issues.error_count > 0 && (
          <span className="text-danger">{repairReport.total_issues.error_count} errors</span>
        )}
        {repairReport.total_issues.warning_count > 0 && (
          <span className="text-warning">{repairReport.total_issues.warning_count} warnings</span>
        )}
        {repairReport.total_issues.info_count > 0 && (
          <span className="text-accent">{repairReport.total_issues.info_count} info</span>
        )}
        {repairReport.total_issues.error_count === 0 &&
          repairReport.total_issues.warning_count === 0 &&
          repairReport.total_issues.info_count === 0 && <span className="text-success">All metadata looks good</span>}
      </div>
    )}

    {/* Identify summary */}
    {view === "identify" && identifyResults && (
      <div className="flex items-center gap-3 px-3 py-2 rounded-xl text-[11px] bg-bg-secondary border border-border shrink-0">
        <span className="text-success">{identifyMatchedCount} matched</span>
        <span className="text-text-tertiary">{identifyResults.length - identifyMatchedCount} unmatched</span>
        {identifyChosenCount > 0 && <span className="text-accent">{identifyChosenCount} selected</span>}
      </div>
    )}

    {/* Quality summary */}
    {view === "quality" && qualityFiles.length > 0 && (
      <div className="flex gap-5 px-5 py-2.5 bg-bg-secondary border border-border rounded-2xl shrink-0 text-xs font-medium">
        {qualityCounts.lossless > 0 && (
          <span className={verdictColor("lossless")}>{qualityCounts.lossless} lossless</span>
        )}
        {qualityCounts.lossy > 0 && <span className={verdictColor("lossy")}>{qualityCounts.lossy} lossy</span>}
        {qualityCounts.suspect > 0 && <span className={verdictColor("suspect")}>{qualityCounts.suspect} suspect</span>}
      </div>
    )}

    {/* Save result */}
    {saveResult && (
      <div
        className={`px-3 py-2 rounded-xl text-[11px] leading-relaxed shrink-0 flex items-start justify-between gap-2 ${
          saveResult.cancelled
            ? "bg-warning/10 text-warning"
            : saveResult.failed > 0
              ? "bg-warning/10 text-warning"
              : "bg-success/10 text-success"
        }`}
      >
        <div>
          {saveResult.cancelled
            ? `Cancelled \u2014 saved ${saveResult.succeeded} of ${saveResult.total} files before stopping`
            : `Saved ${saveResult.succeeded} of ${saveResult.total} files`}
          {!saveResult.cancelled && saveResult.failed > 0 && ` \u2014 ${saveResult.failed} failed`}
          {saveResult.errors.length > 0 && (
            <div className="mt-1 text-[10px] opacity-70">
              {saveResult.errors.slice(0, 3).map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
        </div>
        {canUndo && (
          <button
            onClick={onUndo}
            className="shrink-0 px-3 py-1 bg-bg-card border border-border text-text-secondary rounded-lg text-[11px] font-medium hover:text-text-primary hover:border-border-active transition-all"
          >
            Undo
          </button>
        )}
      </div>
    )}

    {/* Saving progress (fallback when global progress bar is not active) */}
    {phase === "saving" && !progressActive && (
      <div className="px-4 py-3 bg-bg-secondary border border-border rounded-2xl shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-text-secondary font-medium">
            <Spinner /> Saving metadata...
          </div>
          <button
            onClick={onCancel}
            className="px-3 py-1 bg-bg-card border border-border text-text-secondary rounded-lg text-[11px] hover:text-text-primary hover:border-border-active transition-all"
          >
            Cancel
          </button>
        </div>
        {saveProgress && (
          <>
            <div className="w-full h-1.5 bg-bg-card rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-200"
                style={{ width: `${(saveProgress.completed / saveProgress.total) * 100}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] text-text-tertiary truncate max-w-[60%]">{saveProgress.current_file}</span>
              <span className="text-[10px] text-text-secondary font-medium">
                {saveProgress.completed} of {saveProgress.total}
              </span>
            </div>
          </>
        )}
      </div>
    )}

    {/* Error */}
    {error && <div className="px-3 py-2 rounded-xl text-[11px] bg-danger/10 text-danger shrink-0">{error}</div>}
  </>
);
