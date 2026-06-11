import { createContext, useContext, useCallback } from "react";
import { useArtCache } from "./ArtCacheContext";
import { ConfirmDialog } from "../components/atoms/ConfirmDialog/ConfirmDialog";
import { useBackgroundOperation } from "../hooks/useBackgroundOperation";
import type { BackgroundOperationState } from "../hooks/useBackgroundOperation";

interface ArtRepairResult {
  total: number;
  fixed: number;
  already_ok: number;
  failed: number;
  cancelled: boolean;
  errors: string[];
}

interface BackgroundArtRepairActions {
  state: BackgroundOperationState;
  /** Repair album art. Pass `scopePaths` (file paths) to limit to their folders; omit for the whole library. */
  start: (scopePaths?: string[]) => void;
  cancel: () => void;
}

const BackgroundArtRepairContext = createContext<BackgroundArtRepairActions>({
  state: { active: false, total: 0, completed: 0, currentItem: "" },
  start: () => {},
  cancel: () => {},
});

const formatResultMessage = (r: ArtRepairResult): string => {
  if (r.cancelled) {
    const parts = ["Album art repair was cancelled."];
    if (r.fixed > 0) parts.push(`${r.fixed} album${r.fixed !== 1 ? "s" : ""} fixed before cancellation.`);
    return parts.join(" ");
  }
  if (r.total === 0 && r.errors.length === 0) {
    return "All albums in your library already have artwork.";
  }
  const parts: string[] = [];
  if (r.fixed > 0) parts.push(`${r.fixed} fixed`);
  if (r.failed > 0) parts.push(`${r.failed} not found`);
  if (parts.length === 0) return "No albums needed repair.";
  return `Album art repair complete \u2014 ${parts.join(", ")}.`;
};

export const BackgroundArtRepairProvider = ({ children }: { children: React.ReactNode }) => {
  const { bumpArtCache } = useArtCache();
  const { state, result, start, cancel, dismissResult } = useBackgroundOperation<ArtRepairResult>({
    progressEvent: "library-art-repair-progress",
    progressItemKey: "current_album",
    startCommand: "fix_library_album_art",
    cancelCommand: "cancel_art_repair",
    scanningLabel: "Scanning...",
    onSuccess: () => bumpArtCache(),
    onError: (e) => ({
      total: 0,
      fixed: 0,
      already_ok: 0,
      failed: 0,
      cancelled: false,
      errors: [`${e}`],
    }),
  });

  // Guard with Array.isArray so callers can pass `start` directly as an event handler
  const startRepair = useCallback(
    (scopePaths?: string[]) => start(Array.isArray(scopePaths) ? { scopePaths } : undefined),
    [start],
  );

  return (
    <BackgroundArtRepairContext.Provider value={{ state, start: startRepair, cancel }}>
      {children}
      {result && (
        <ConfirmDialog
          title={result.cancelled ? "Repair Cancelled" : "Album Art Repair"}
          message={formatResultMessage(result)}
          confirmLabel="OK"
          hideCancel
          onConfirm={dismissResult}
          onCancel={dismissResult}
        />
      )}
    </BackgroundArtRepairContext.Provider>
  );
};

export const useBackgroundArtRepair = (): BackgroundArtRepairActions => useContext(BackgroundArtRepairContext);
