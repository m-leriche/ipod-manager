import { createContext, useContext, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ConfirmDialog } from "../components/atoms/ConfirmDialog/ConfirmDialog";
import { useBackgroundOperation } from "../hooks/useBackgroundOperation";
import type { BackgroundOperationState } from "../hooks/useBackgroundOperation";

interface LyricsFetchResult {
  total: number;
  fetched: number;
  already_had: number;
  not_found: number;
  skipped_not_found: number;
  cancelled: boolean;
}

interface BackgroundLyricsActions {
  state: BackgroundOperationState;
  /** Fetch missing lyrics. Pass `scopePaths` (file paths) to limit to those tracks; omit for the whole library. */
  start: (scopePaths?: string[]) => void;
  cancel: () => void;
}

const BackgroundLyricsContext = createContext<BackgroundLyricsActions>({
  state: { active: false, total: 0, completed: 0, currentItem: "" },
  start: () => {},
  cancel: () => {},
});

const formatResultMessage = (r: LyricsFetchResult): string => {
  if (r.cancelled) {
    const parts = ["Lyrics fetch was cancelled."];
    if (r.fetched > 0) parts.push(`${r.fetched} track${r.fetched !== 1 ? "s" : ""} fetched before cancellation.`);
    if (r.skipped_not_found > 0) parts.push(`${r.skipped_not_found} previously unfound skipped.`);
    return parts.join(" ");
  }
  if (r.total === 0 && r.skipped_not_found === 0) {
    return "All tracks in your library already have lyrics.";
  }
  if (r.total === 0 && r.skipped_not_found > 0) {
    return `All remaining tracks already have lyrics. ${r.skipped_not_found} track${r.skipped_not_found !== 1 ? "s were" : " was"} previously not found and skipped.`;
  }
  const parts: string[] = [];
  if (r.fetched > 0) parts.push(`${r.fetched} found`);
  if (r.not_found > 0) parts.push(`${r.not_found} not found`);
  if (r.skipped_not_found > 0) parts.push(`${r.skipped_not_found} previously unfound skipped`);
  if (parts.length === 0) return "No tracks needed lyrics.";
  return `Lyrics fetch complete \u2014 ${parts.join(", ")}.`;
};

export const BackgroundLyricsProvider = ({ children }: { children: React.ReactNode }) => {
  const { state, result, start, cancel, dismissResult } = useBackgroundOperation<LyricsFetchResult>({
    progressEvent: "library-lyrics-progress",
    progressItemKey: "current_track",
    startCommand: "fetch_library_lyrics",
    cancelCommand: "cancel_lyrics_fetch",
    scanningLabel: "Scanning library...",
    onError: () => ({
      total: 0,
      fetched: 0,
      already_had: 0,
      not_found: 0,
      skipped_not_found: 0,
      cancelled: false,
    }),
  });

  // Guard with Array.isArray so callers can pass `start` directly as an event handler
  const startFetch = useCallback(
    (scopePaths?: string[]) => start(Array.isArray(scopePaths) ? { scopePaths } : undefined),
    [start],
  );

  const showRetryOption = result ? result.skipped_not_found > 0 || result.not_found > 0 : false;

  const handleRetryNotFound = useCallback(async () => {
    await invoke("reset_lyrics_not_found");
    dismissResult();
    start();
  }, [start, dismissResult]);

  return (
    <BackgroundLyricsContext.Provider value={{ state, start: startFetch, cancel }}>
      {children}
      {result && (
        <ConfirmDialog
          title={result.cancelled ? "Fetch Cancelled" : "Lyrics Fetch"}
          message={formatResultMessage(result)}
          confirmLabel="OK"
          hideCancel={!showRetryOption}
          cancelLabel="Retry Unfound"
          onConfirm={dismissResult}
          onCancel={handleRetryNotFound}
        />
      )}
    </BackgroundLyricsContext.Provider>
  );
};

export const useBackgroundLyrics = (): BackgroundLyricsActions => useContext(BackgroundLyricsContext);
