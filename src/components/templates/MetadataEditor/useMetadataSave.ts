import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { buildUpdate } from "./helpers";
import type {
  TrackMetadata,
  MetadataUpdate,
  MetadataSaveProgress,
  MetadataSaveResult,
  SanitizeResult,
} from "../../../types/metadata";
import type { Phase, EditableFields, SanitizeModalOptions } from "./types";

interface UseMetadataSaveParams {
  tracks: TrackMetadata[];
  editedTracks: Record<string, EditableFields>;
  selected: Set<string>;
  selectedTracks: TrackMetadata[];
  undoOperations: MetadataUpdate[] | null;
  setPhase: (p: Phase) => void;
  setEditedTracks: React.Dispatch<React.SetStateAction<Record<string, EditableFields>>>;
  setTracks: React.Dispatch<React.SetStateAction<TrackMetadata[]>>;
  setSaveResult: (r: MetadataSaveResult | null) => void;
  setSaveProgress: (p: MetadataSaveProgress | null) => void;
  setUndoOperations: (ops: MetadataUpdate[] | null) => void;
  setError: (e: string | null) => void;
  setRepairingArt: (v: boolean) => void;
  setArtCacheBust: React.Dispatch<React.SetStateAction<number>>;
  bumpArtCache: () => void;
  startProgress: (msg: string, cancel: () => void) => void;
  finishProgress: (msg: string) => void;
  failProgress: (msg: string) => void;
  cancel: () => void;
  refreshTracks: () => Promise<void>;
}

export const useMetadataSave = ({
  tracks,
  editedTracks,
  selected,
  selectedTracks,
  undoOperations,
  setPhase,
  setEditedTracks,
  setTracks,
  setSaveResult,
  setSaveProgress,
  setUndoOperations,
  setError,
  setRepairingArt,
  setArtCacheBust,
  bumpArtCache,
  startProgress,
  finishProgress,
  failProgress,
  cancel,
  refreshTracks,
}: UseMetadataSaveParams) => {
  const handleSave = useCallback(async () => {
    const updates = [];
    for (const [filePath, edited] of Object.entries(editedTracks)) {
      const original = tracks.find((t) => t.file_path === filePath);
      if (!original) continue;
      const update = buildUpdate(original, edited);
      if (update) updates.push(update);
    }
    if (updates.length === 0) return;

    setPhase("saving");
    setSaveResult(null);
    setSaveProgress(null);
    setUndoOperations(null);
    startProgress("Saving metadata...", cancel);
    try {
      const result = await invoke<MetadataSaveResult>("save_metadata", { updates });
      setSaveProgress(null);
      setSaveResult(result);
      if (result.succeeded > 0) {
        setUndoOperations(result.undo_operations);
        setTracks((prev) =>
          prev.map((t) => {
            const edited = editedTracks[t.file_path];
            if (!edited) return t;
            const update = buildUpdate(t, edited);
            if (!update) return t;
            return {
              ...t,
              title: update.title ?? t.title,
              artist: update.artist ?? t.artist,
              album: update.album ?? t.album,
              album_artist: update.album_artist ?? t.album_artist,
              sort_artist: update.sort_artist ?? t.sort_artist,
              sort_album_artist: update.sort_album_artist ?? t.sort_album_artist,
              track: update.track ?? t.track,
              track_total: update.track_total ?? t.track_total,
              year: update.year ?? t.year,
              genre: update.genre ?? t.genre,
            };
          }),
        );
        setEditedTracks({});
      }
      setPhase("scanned");
      finishProgress(`Saved ${result.succeeded} of ${result.total} files`);
    } catch (e) {
      setError(`${e}`);
      setPhase("scanned");
      failProgress(`${e}`);
    }
  }, [
    tracks,
    editedTracks,
    setPhase,
    setSaveResult,
    setSaveProgress,
    setUndoOperations,
    startProgress,
    cancel,
    setTracks,
    setEditedTracks,
    setError,
    finishProgress,
    failProgress,
  ]);

  const handleUndo = useCallback(async () => {
    if (!undoOperations || undoOperations.length === 0) return;

    const ops = undoOperations;
    setUndoOperations(null);
    setSaveResult(null);
    setPhase("saving");
    setSaveProgress(null);
    startProgress("Undoing changes...", cancel);
    try {
      // Intentionally not storing undo from undo result (no redo support)
      const result = await invoke<MetadataSaveResult>("save_metadata", { updates: ops });
      setSaveProgress(null);
      setSaveResult(result);
      setPhase("scanned");
      finishProgress(`Undid ${result.succeeded} of ${result.total} files`);
      if (result.succeeded > 0) {
        refreshTracks();
      }
    } catch (e) {
      setError(`${e}`);
      setPhase("scanned");
      failProgress(`${e}`);
    }
  }, [
    undoOperations,
    setUndoOperations,
    setSaveResult,
    setPhase,
    setSaveProgress,
    startProgress,
    cancel,
    finishProgress,
    refreshTracks,
    setError,
    failProgress,
  ]);

  const handleSanitize = useCallback(
    async (options: SanitizeModalOptions) => {
      const filePaths = [...selected];
      setPhase("saving");
      startProgress("Sanitizing tags...", cancel);
      try {
        const result = await invoke<SanitizeResult>("sanitize_tags", {
          options: {
            file_paths: filePaths,
            retain_fields: options.retainFields,
            picture_action:
              options.pictureAction === "clear"
                ? { type: "ClearAll" }
                : options.pictureAction === "retain_front"
                  ? { type: "RetainFrontCover" }
                  : { type: "MoveFrontCoverToFile", filename: options.coverFilename },
            preserve_replay_gain: options.preserveReplayGain,
            reduce_date_to_year: options.reduceDateToYear,
            drop_disc_for_single: options.dropDiscForSingle,
          },
        });
        finishProgress(`Sanitized ${result.succeeded} of ${result.total} files`);
        if (result.succeeded > 0) refreshTracks();
        else setPhase("scanned");
      } catch (e) {
        setError(`${e}`);
        setPhase("scanned");
        failProgress(`${e}`);
      }
    },
    [selected, setPhase, startProgress, cancel, finishProgress, refreshTracks, setError, failProgress],
  );

  const handleRepairArt = useCallback(async () => {
    const folders = [...new Set(selectedTracks.map((t) => t.file_path.replace(/\/[^/]+$/, "")))];
    if (folders.length === 0) return;
    setRepairingArt(true);
    const unlisten = await listen("albumart-progress", () => {});
    try {
      await invoke("fix_album_art", { folders });
      setArtCacheBust((n) => n + 1);
      bumpArtCache();
    } catch (e) {
      console.error("Failed to repair album art:", e);
    } finally {
      setRepairingArt(false);
      unlisten();
    }
  }, [selectedTracks, setRepairingArt, setArtCacheBust, bumpArtCache]);

  return { handleSave, handleUndo, handleSanitize, handleRepairArt };
};
