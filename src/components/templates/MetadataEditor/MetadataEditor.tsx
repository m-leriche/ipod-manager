import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { pickFolder } from "../../../utils/pickPath";
import { cancelSync } from "../../../utils/cancelSync";
import { FolderPicker } from "../../atoms/FolderPicker/FolderPicker";
import { MetadataTree } from "./MetadataTree";
import { MetadataEditPanel } from "./MetadataEditPanel";
import { MetadataToolbar } from "./MetadataToolbar";
import { MetadataStatusBanners } from "./MetadataStatusBanners";
import { RepairAlbumCard } from "./RepairAlbumCard";
import { RepairDetailPanel } from "./RepairDetailPanel";
import { TagSanitizerModal } from "./TagSanitizerModal";
import { QualityList } from "../QualityAnalyzer/QualityList";
import { QualityDetailPanel } from "../QualityAnalyzer/QualityDetailPanel";
import { AudioPreviewModal } from "../QualityAnalyzer/AudioPreviewModal";
import { useAudioPlayback } from "../../molecules/MiniPlayer/useAudioPlayback";
import { useMetadataEvents } from "./useMetadataEvents";
import { useDragDrop } from "./useDragDrop";
import { useRepairActions } from "./useRepairActions";
import { useQualityActions } from "./useQualityActions";
import { useIdentifyActions } from "./useIdentifyActions";
import { IdentifyPanel } from "./IdentifyPanel";
import { groupTracks, buildUpdate, computeBatchFields, computeMixedFlags, trackToEditable } from "./helpers";
import type {
  TrackMetadata,
  MetadataUpdate,
  MetadataSaveProgress,
  MetadataSaveResult,
  SanitizeResult,
} from "../../../types/metadata";
import type { Phase, View, EditableFields, SanitizeModalOptions } from "./types";
import { useProgress } from "../../../contexts/ProgressContext";
import { useArtCache } from "../../../contexts/ArtCacheContext";
import { listen } from "@tauri-apps/api/event";

export const MetadataEditor = ({
  initialPaths,
  onInitialPathsConsumed,
}: {
  initialPaths?: string[] | null;
  onInitialPathsConsumed?: () => void;
} = {}) => {
  const {
    state: progressState,
    start: startProgress,
    update: updateProgress,
    finish: finishProgress,
    fail: failProgress,
  } = useProgress();
  const { bumpArtCache } = useArtCache();

  // ── Shared state ──
  const [phase, setPhase] = useState<Phase>("idle");
  const [scanPath, setScanPath] = useState("");
  const [tracks, setTracks] = useState<TrackMetadata[]>([]);
  const [saveProgress, setSaveProgress] = useState<MetadataSaveProgress | null>(null);
  const [saveResult, setSaveResult] = useState<MetadataSaveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("edit");

  // ── Editor state ──
  const [editedTracks, setEditedTracks] = useState<Record<string, EditableFields>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [repairingArt, setRepairingArt] = useState(false);
  const [artCacheBust, setArtCacheBust] = useState(0);
  const [sanitizerOpen, setSanitizerOpen] = useState(false);
  const [undoOperations, setUndoOperations] = useState<MetadataUpdate[] | null>(null);
  const lastScanPaths = useRef<string[]>([]);

  const cancel = cancelSync;

  // ── Refresh tracks ──
  const refreshTracks = async () => {
    const paths = lastScanPaths.current;
    if (paths.length === 0) return;
    setEditedTracks({});
    setSaveResult(null);
    setError(null);
    try {
      const data = await invoke<TrackMetadata[]>("scan_metadata_paths", { paths });
      setTracks(data);
      setPhase("scanned");
    } catch (e) {
      setError(`Refresh failed: ${e}`);
      setPhase("scanned");
    }
  };

  // ── Event listeners ──
  useMetadataEvents(updateProgress, setSaveProgress);

  // ── Hooks ──
  const repair = useRepairActions(
    tracks,
    setPhase,
    setError,
    setSaveResult,
    setSaveProgress as (p: null) => void,
    startProgress,
    finishProgress,
    failProgress,
    cancel,
    refreshTracks,
    setUndoOperations,
  );

  const identify = useIdentifyActions(
    setPhase,
    setError,
    setSaveResult,
    startProgress,
    finishProgress,
    failProgress,
    cancel,
    refreshTracks,
    setView,
    setUndoOperations,
  );

  const quality = useQualityActions(setPhase, setError, startProgress, finishProgress, failProgress, cancel, setView);

  const audio = useAudioPlayback(quality.selectedQualityFile);

  // ── Scan actions ──
  const doScan = async (paths: string[], invokeFn: () => Promise<TrackMetadata[]>) => {
    lastScanPaths.current = paths;
    setPhase("scanning");
    setError(null);
    setSaveResult(null);
    setUndoOperations(null);
    setTracks([]);
    setEditedTracks({});
    setSelected(new Set());
    repair.resetRepair();
    startProgress("Scanning metadata...", cancel);
    try {
      const data = await invokeFn();
      setTracks(data);
      setScanPath(paths.length === 1 ? paths[0] : `${paths.length} dropped items`);
      setPhase("scanned");
      setView("edit");
      finishProgress(`Scanned ${data.length} tracks`);
    } catch (e) {
      const msg = `${e}`;
      if (msg === "Cancelled") {
        setPhase("idle");
        failProgress("Scan cancelled");
      } else {
        setError(msg);
        setPhase("idle");
        failProgress(msg);
      }
    }
  };

  const scanPaths = (paths: string[]) => doScan(paths, () => invoke<TrackMetadata[]>("scan_metadata_paths", { paths }));
  const scan = (path?: string) => {
    const targetPath = path ?? scanPath;
    return doScan([targetPath], () => invoke<TrackMetadata[]>("scan_metadata", { path: targetPath }));
  };

  const browse = async () => {
    try {
      const path = await pickFolder("Select music folder");
      if (path) {
        setScanPath(path);
        scan(path);
      }
    } catch (e) {
      setError(`Failed to open folder picker: ${e}`);
    }
  };

  // ── Auto-scan from external navigation ──
  useEffect(() => {
    if (initialPaths && initialPaths.length > 0) {
      scanPaths(initialPaths);
      onInitialPathsConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDragOver = useDragDrop(phase, scanPaths);

  // ── Editor logic ──
  const groups = useMemo(() => groupTracks(tracks, editedTracks), [tracks, editedTracks]);
  const dirtyCount = useMemo(() => {
    let count = 0;
    for (const [filePath, edited] of Object.entries(editedTracks)) {
      const original = tracks.find((t) => t.file_path === filePath);
      if (original && buildUpdate(original, edited) !== null) count++;
    }
    return count;
  }, [editedTracks, tracks]);

  const selectedTracks = useMemo(() => tracks.filter((t) => selected.has(t.file_path)), [tracks, selected]);
  const batchFields = useMemo(() => computeBatchFields(selectedTracks, editedTracks), [selectedTracks, editedTracks]);
  const mixedFlags = useMemo(() => computeMixedFlags(selectedTracks, editedTracks), [selectedTracks, editedTracks]);

  const toggleTrack = useCallback((filePath: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  }, []);

  const selectGroup = useCallback((filePaths: string[]) => {
    setSelected((prev) => {
      const allSelected = filePaths.every((p) => prev.has(p));
      const next = new Set(prev);
      if (allSelected) filePaths.forEach((p) => next.delete(p));
      else filePaths.forEach((p) => next.add(p));
      return next;
    });
  }, []);

  const handleFieldChange = useCallback(
    (field: keyof EditableFields, value: string) => {
      setEditedTracks((prev) => {
        const next = { ...prev };
        for (const track of selectedTracks) {
          const existing = next[track.file_path] ?? trackToEditable(track);
          next[track.file_path] = { ...existing, [field]: value };
        }
        return next;
      });
    },
    [selectedTracks],
  );

  const handleRevert = useCallback(() => {
    setEditedTracks((prev) => {
      const next = { ...prev };
      for (const filePath of selected) delete next[filePath];
      return next;
    });
  }, [selected]);

  const selectedFolderPath = useMemo(() => {
    if (selectedTracks.length === 0) return null;
    const folders = [...new Set(selectedTracks.map((t) => t.file_path.replace(/\/[^/]+$/, "")))];
    return folders.length === 1 ? folders[0] : null;
  }, [selectedTracks]);

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
  }, [selectedTracks, bumpArtCache]);

  const handleSave = async () => {
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
  };

  const handleUndo = async () => {
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
  };

  // ── Sanitize logic ──
  const handleSanitize = async (options: SanitizeModalOptions) => {
    setSanitizerOpen(false);
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
  };

  // ── Idle ──
  if (phase === "idle") {
    return (
      <>
        <div className="flex items-center gap-2 bg-bg-secondary border border-border rounded-2xl px-5 py-3 shrink-0">
          <FolderPicker label="Folder" path={scanPath || null} onBrowse={browse} />
          <button
            onClick={() => scan()}
            disabled={!scanPath}
            className="px-3 py-1.5 bg-text-primary text-bg-primary rounded-lg text-xs font-medium transition-all hover:not-disabled:opacity-90 disabled:opacity-20 disabled:cursor-not-allowed shrink-0"
          >
            Scan
          </button>
          {error && <span className="text-danger text-[11px] ml-2">{error}</span>}
        </div>
        <div
          className={`flex-1 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all ${
            isDragOver ? "border-accent bg-accent/5" : "border-border hover:border-border-active"
          }`}
        >
          <div className={`text-3xl mb-3 transition-colors ${isDragOver ? "text-accent" : "text-text-tertiary"}`}>
            {isDragOver ? "\u2193" : "\u266B"}
          </div>
          <p
            className={`text-xs font-medium mb-1 transition-colors ${isDragOver ? "text-accent" : "text-text-secondary"}`}
          >
            {isDragOver ? "Drop to scan" : "Drop audio files or folders here"}
          </p>
          <p className="text-[11px] text-text-tertiary">Drag from Finder to scan metadata</p>
        </div>
      </>
    );
  }

  if (phase === "scanning" || phase === "looking_up") {
    return <div className="flex-1" />;
  }

  // ── Scanned / Saving (main view) ──
  return (
    <>
      <MetadataToolbar
        scanPath={scanPath}
        trackCount={tracks.length}
        phase={phase}
        view={view}
        onViewChange={setView}
        onBrowse={browse}
        onRescan={() => scan()}
        dirtyCount={dirtyCount}
        repairReport={repair.report}
        onStartRepair={repair.startRepair}
        repairTotalAccepted={repair.totalAccepted}
        onClearAllRepairs={repair.handleClearAllRepairs}
        onApplyRepairs={repair.handleApplyRepairs}
        onAcceptAllRepairs={repair.handleAcceptAllRepairs}
        hasQualityResults={quality.qualityFiles.length > 0}
        onStartQualityScan={() => {
          const paths = selected.size > 0 ? [...selected] : tracks.map((t) => t.file_path);
          quality.startQualityScan(paths);
        }}
        identifyResults={identify.results}
        onStartIdentify={(filePaths) => identify.startIdentify(filePaths)}
        identifyChosenCount={identify.chosenCount}
        identifyMatchedCount={identify.matchedCount}
        onAutoSelectBest={identify.autoSelectBest}
        onClearAllIdentify={identify.clearAll}
        onApplyIdentify={identify.applyChoices}
        tracks={tracks}
      />

      <MetadataStatusBanners
        view={view}
        phase={phase}
        error={error}
        repairReport={repair.report}
        identifyResults={identify.results}
        identifyMatchedCount={identify.matchedCount}
        identifyChosenCount={identify.chosenCount}
        qualityFiles={quality.qualityFiles}
        qualityCounts={quality.qualityCounts}
        saveResult={saveResult}
        saveProgress={saveProgress}
        progressActive={progressState.active}
        canUndo={undoOperations !== null && undoOperations.length > 0}
        onCancel={cancel}
        onUndo={handleUndo}
      />

      {/* Main content */}
      <div className="flex-1 flex gap-3 min-h-0">
        {view === "edit" && (
          <>
            <MetadataTree
              groups={groups}
              editedTracks={editedTracks}
              selected={selected}
              onToggleTrack={toggleTrack}
              onSelectAlbum={selectGroup}
              onSelectArtist={selectGroup}
              onSanitize={() => setSanitizerOpen(true)}
            />
            {selected.size > 0 && batchFields && mixedFlags && (
              <MetadataEditPanel
                fields={batchFields}
                mixed={mixedFlags}
                selectedCount={selected.size}
                dirtyCount={dirtyCount}
                saving={phase === "saving"}
                folderPath={selectedFolderPath}
                repairing={repairingArt}
                artCacheBust={artCacheBust}
                onFieldChange={handleFieldChange}
                onSave={handleSave}
                onRevert={handleRevert}
                onRepairArt={handleRepairArt}
              />
            )}
          </>
        )}

        {view === "repair" && repair.report && (
          <>
            <div className="w-72 shrink-0 bg-bg-secondary border border-border rounded-2xl flex flex-col min-h-0">
              <div className="px-4 py-3 border-b border-border shrink-0">
                <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-widest">
                  Albums ({repair.sortedAlbums.length})
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-1.5">
                {repair.sortedAlbums.map((album) => (
                  <RepairAlbumCard
                    key={album.folder_path}
                    album={album}
                    selected={repair.selectedAlbum === album.folder_path}
                    onClick={() => repair.setSelectedAlbum(album.folder_path)}
                  />
                ))}
              </div>
            </div>
            {repair.selectedAlbumData ? (
              <RepairDetailPanel
                album={repair.selectedAlbumData}
                acceptedFixes={repair.acceptedFixes}
                onToggleFix={repair.toggleFix}
                onAcceptAll={() => repair.acceptAllForAlbum(repair.selectedAlbumData!)}
                onClearAll={() => repair.clearAllForAlbum(repair.selectedAlbumData!)}
                onSwitchRelease={repair.handleSwitchRelease}
                switching={repair.switching}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center bg-bg-secondary border border-border rounded-2xl">
                <span className="text-text-tertiary text-xs">Select an album to see details</span>
              </div>
            )}
          </>
        )}

        {view === "identify" && identify.results && (
          <IdentifyPanel
            results={identify.results}
            selectedFile={identify.selectedFile}
            onSelectFile={identify.setSelectedFile}
            selectedResult={identify.selectedResult}
            choices={identify.choices}
            onSelectMatch={identify.selectMatch}
            onClearMatch={identify.clearMatch}
          />
        )}

        {view === "quality" && quality.qualityFiles.length > 0 && (
          <>
            <QualityList
              groups={quality.qualityGroups}
              selectedFile={quality.selectedQualityFile}
              onSelectFile={quality.setSelectedQualityFile}
            />
            {quality.selectedQualityData && (
              <QualityDetailPanel
                file={quality.selectedQualityData}
                spectrogramCache={quality.spectrograms}
                onSpectrogramLoaded={quality.handleSpectrogramLoaded}
                waveformCache={quality.waveforms}
                onWaveformLoaded={quality.handleWaveformLoaded}
                onOpenPreview={quality.handleOpenQualityPreview}
                audio={audio}
              />
            )}
          </>
        )}
      </div>

      {isDragOver && phase === "scanned" && (
        <div className="absolute inset-0 bg-accent/5 border-2 border-dashed border-accent rounded-2xl flex items-center justify-center pointer-events-none z-40">
          <span className="text-accent text-xs font-medium">Drop to rescan</span>
        </div>
      )}

      {sanitizerOpen && (
        <TagSanitizerModal
          selectedCount={selected.size}
          onStart={handleSanitize}
          onClose={() => setSanitizerOpen(false)}
        />
      )}

      {quality.qualityPreviewModal &&
        (() => {
          const modalFile =
            quality.qualityFiles.find((f) => f.file_path === quality.qualityPreviewModal!.filePath) ?? null;
          return modalFile ? (
            <AudioPreviewModal
              type={quality.qualityPreviewModal.type}
              file={modalFile}
              spectrogramBase64={quality.spectrograms[quality.qualityPreviewModal.filePath]}
              waveformResult={quality.waveforms[quality.qualityPreviewModal.filePath]}
              audio={audio}
              onClose={() => quality.setQualityPreviewModal(null)}
            />
          ) : null;
        })()}
    </>
  );
};
