import { useState } from "react";
import { ConfirmDialog } from "../../atoms/ConfirmDialog/ConfirmDialog";
import type { SyncActionsProps } from "./types";

type PendingAction = "delete" | "mirror" | null;

export const SyncActions = ({
  syncing,
  progress,
  result,
  nSrc,
  nTgt,
  nMirror,
  onMirrorToTarget,
  onCopyToTarget,
  onCopyToSource,
  onDeleteTarget,
  onCancel,
}: SyncActionsProps) => {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  return (
    <div className="shrink-0 flex flex-col gap-3">
      {syncing && progress ? (
        <div className="bg-bg-secondary border border-border rounded-2xl px-5 py-3.5 shrink-0">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-medium text-text-primary">
              {progress.phase === "copying" ? "Copying" : progress.phase === "deleting" ? "Deleting" : "Finishing"}...
            </span>
            <span className="text-xs text-text-secondary">
              {progress.completed} of {progress.total} files
            </span>
          </div>
          <div className="w-full h-1.5 bg-bg-card rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-text-primary rounded-full transition-all duration-200"
              style={{ width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-text-tertiary truncate flex-1 min-w-0 mr-3">
              {progress.current_file || "Finishing up..."}
            </span>
            <button
              onClick={onCancel}
              className="px-3 py-1 bg-transparent border border-danger/30 text-danger rounded-lg text-[10px] font-medium shrink-0 hover:bg-danger/10 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2.5 shrink-0">
          <button
            disabled={syncing || nMirror === 0}
            onClick={() => setPendingAction("mirror")}
            className="flex-1 py-2.5 bg-text-primary text-bg-primary rounded-xl text-xs font-medium transition-all hover:not-disabled:opacity-90 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            Mirror {nMirror} to iPod {"\u2192"}
          </button>
          <button
            disabled={syncing || nSrc === 0}
            onClick={onCopyToTarget}
            className="py-2.5 px-4 bg-bg-card border border-border text-text-secondary rounded-xl text-xs font-medium transition-all hover:not-disabled:bg-bg-hover hover:not-disabled:text-text-primary disabled:opacity-20 disabled:cursor-not-allowed"
          >
            Copy {nSrc} {"\u2192"}
          </button>
          <button
            disabled={syncing || nTgt === 0}
            onClick={onCopyToSource}
            className="py-2.5 px-4 bg-bg-card border border-border text-text-secondary rounded-xl text-xs font-medium transition-all hover:not-disabled:bg-bg-hover hover:not-disabled:text-text-primary disabled:opacity-20 disabled:cursor-not-allowed"
          >
            {"\u2190"} Copy {nTgt}
          </button>
          <button
            disabled={syncing || nTgt === 0}
            onClick={() => setPendingAction("delete")}
            className="py-2.5 px-4 bg-transparent border border-danger/30 text-danger rounded-xl text-xs font-medium transition-all hover:not-disabled:bg-danger/10 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            Delete {nTgt}
          </button>
        </div>
      )}

      {/* Result toast */}
      {result && !syncing && (
        <div
          className={`px-3 py-2 rounded-xl text-[11px] leading-relaxed ${result.failed || result.cancelled ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}`}
        >
          {result.cancelled
            ? `Cancelled: ${result.succeeded} of ${result.total} completed`
            : `${result.succeeded}/${result.total} completed`}
          {result.failed > 0 && `. ${result.failed} failed.`}
          {result.errors.length > 0 && (
            <div className="mt-1 text-[10px] opacity-70">
              {result.errors.slice(0, 3).map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {pendingAction === "delete" && (
        <ConfirmDialog
          title="Delete Files"
          message={`This will permanently delete ${nTgt} file${nTgt !== 1 ? "s" : ""} from the iPod. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            onDeleteTarget();
            setPendingAction(null);
          }}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {pendingAction === "mirror" && (
        <ConfirmDialog
          title="Mirror to iPod"
          message={`This will sync ${nMirror} file${nMirror !== 1 ? "s" : ""} to the iPod, copying new/modified files and deleting extra files to match the source. This cannot be undone.`}
          confirmLabel="Mirror"
          danger
          onConfirm={() => {
            onMirrorToTarget();
            setPendingAction(null);
          }}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </div>
  );
};
