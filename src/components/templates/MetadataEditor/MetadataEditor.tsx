import { useState, useMemo, useCallback, useEffect, useRef } from "react";
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
import { useMetadataScan } from "./useMetadataScan";
import { useMetadataSave } from "./useMetadataSave";
import { IdentifyPanel } from "./IdentifyPanel";
import { groupTracks, buildUpdate, computeBatchFields, computeMixedFlags, trackToEditable } from "./helpers";
import { stageChanges, previewTemplate } from "./batchOperations";
import type { FieldChange } from "./batchOperations";
import { FindReplaceModal } from "./FindReplaceModal";
import { TemplatesModal } from "./TemplatesModal";
import type {
  TrackMetadata,
  MetadataUpdate,
  MetadataSaveProgress,
  MetadataSaveResult,
  MetadataTemplate,
} from "../../../types/metadata";
import type { Phase, View, EditableFields } from "./types";
import { useProgress } from "../../../contexts/ProgressContext";
import { useArtCache } from "../../../contexts/ArtCacheContext";
import { useToast } from "../../../contexts/ToastContext";

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
  const toast = useToast();

  // ── Shared state ──
  const [phase, setPhase] = useState<Phase>("idle");
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
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [undoOperations, setUndoOperations] = useState<MetadataUpdate[] | null>(null);

  const cancel = cancelSync;

  // ── Event listeners ──
  useMetadataEvents(updateProgress, setSaveProgress);

  // ── Hooks ──
  // Use a ref for onBeforeScan to break the circular dependency between scan and repair hooks
  const onBeforeScanRef = useRef(() => {});

  const scanHook = useMetadataScan({
    setPhase,
    setTracks,
    setEditedTracks,
    setSelected,
    setError,
    setSaveResult,
    setView,
    setUndoOperations,
    onBeforeScan: () => onBeforeScanRef.current(),
    startProgress,
    finishProgress,
    failProgress,
    cancel,
  });

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
    scanHook.refreshTracks,
    setUndoOperations,
  );

  onBeforeScanRef.current = repair.resetRepair;

  const identify = useIdentifyActions(
    setPhase,
    setError,
    setSaveResult,
    startProgress,
    finishProgress,
    failProgress,
    cancel,
    scanHook.refreshTracks,
    setView,
    setUndoOperations,
  );

  const quality = useQualityActions(setPhase, setError, startProgress, finishProgress, failProgress, cancel, setView);

  const audio = useAudioPlayback(quality.selectedQualityFile);

  // ── Editor logic ──
  const groups = useMemo(() => groupTracks(tracks, editedTracks), [tracks, editedTracks]);
  const dirtyCount = useMemo(() => {
    const byPath = new Map(tracks.map((t) => [t.file_path, t]));
    let count = 0;
    for (const [filePath, edited] of Object.entries(editedTracks)) {
      const original = byPath.get(filePath);
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

  // ── Batch operations (find & replace, templates) ──
  // Target the selection when there is one, otherwise all scanned tracks.
  const batchTargets = selectedTracks.length > 0 ? selectedTracks : tracks;
  const batchTargetLabel =
    selectedTracks.length > 0
      ? `${selectedTracks.length} selected track${selectedTracks.length === 1 ? "" : "s"}`
      : `all ${tracks.length} track${tracks.length === 1 ? "" : "s"}`;

  const handleApplyFindReplace = useCallback(
    (changes: FieldChange[]) => {
      setEditedTracks((prev) => stageChanges(tracks, prev, changes));
      setFindReplaceOpen(false);
      toast.success(`Staged ${changes.length} change${changes.length === 1 ? "" : "s"} — review and save`);
    },
    [tracks, toast],
  );

  const handleApplyTemplate = useCallback(
    (template: MetadataTemplate) => {
      const changes = previewTemplate(batchTargets, editedTracks, template);
      setTemplatesOpen(false);
      if (changes.length === 0) {
        toast.info("Template matches the current values — nothing to change");
        return;
      }
      setEditedTracks((prev) => stageChanges(tracks, prev, changes));
      toast.success(`Staged ${changes.length} change${changes.length === 1 ? "" : "s"} — review and save`);
    },
    [batchTargets, editedTracks, tracks, toast],
  );

  const selectedFolderPath = useMemo(() => {
    if (selectedTracks.length === 0) return null;
    const folders = [...new Set(selectedTracks.map((t) => t.file_path.replace(/\/[^/]+$/, "")))];
    return folders.length === 1 ? folders[0] : null;
  }, [selectedTracks]);

  // ── Save / undo / sanitize / repair art ──
  const { handleSave, handleUndo, handleSanitize, handleRepairArt } = useMetadataSave({
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
    refreshTracks: scanHook.refreshTracks,
    onSaveToast: toast.success,
  });

  // ── Cmd+Z undo shortcut ──
  const handleUndoRef = useRef(handleUndo);
  handleUndoRef.current = handleUndo;
  const undoAvailableRef = useRef(false);
  undoAvailableRef.current = undoOperations !== null && undoOperations.length > 0;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey && undoAvailableRef.current) {
        // Don't intercept native undo in text inputs
        const el = document.activeElement;
        if (
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          (el as HTMLElement)?.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        handleUndoRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Auto-scan from external navigation ──
  useEffect(() => {
    if (initialPaths && initialPaths.length > 0) {
      scanHook.scanPaths(initialPaths);
      onInitialPathsConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDragOver = useDragDrop(phase, scanHook.scanPaths);

  // ── Idle ──
  if (phase === "idle") {
    return (
      <>
        <div className="flex items-center gap-2 bg-bg-secondary border border-border rounded-2xl px-5 py-3 shrink-0">
          <FolderPicker label="Folder" path={scanHook.scanPath || null} onBrowse={scanHook.browse} />
          <button
            onClick={() => scanHook.scan()}
            disabled={!scanHook.scanPath}
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
        scanPath={scanHook.scanPath}
        trackCount={tracks.length}
        phase={phase}
        view={view}
        onViewChange={setView}
        onBrowse={scanHook.browse}
        onRescan={() => scanHook.scan()}
        dirtyCount={dirtyCount}
        onOpenFindReplace={() => setFindReplaceOpen(true)}
        onOpenTemplates={() => setTemplatesOpen(true)}
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
                onToggleField={(field) => repair.toggleFieldForAlbum(repair.selectedAlbumData!, field)}
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

      {findReplaceOpen && (
        <FindReplaceModal
          tracks={batchTargets}
          editedTracks={editedTracks}
          targetLabel={batchTargetLabel}
          onApply={handleApplyFindReplace}
          onClose={() => setFindReplaceOpen(false)}
        />
      )}

      {templatesOpen && (
        <TemplatesModal
          targetLabel={batchTargetLabel}
          onApply={handleApplyTemplate}
          onClose={() => setTemplatesOpen(false)}
        />
      )}

      {sanitizerOpen && (
        <TagSanitizerModal
          selectedCount={selected.size}
          onStart={(options) => {
            setSanitizerOpen(false);
            handleSanitize(options);
          }}
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
