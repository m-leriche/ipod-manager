import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { FolderPicker } from "../../atoms/FolderPicker/FolderPicker";
import { Spinner } from "../../atoms/Spinner/Spinner";
import { MetadataTree } from "./MetadataTree";
import { MetadataEditPanel } from "./MetadataEditPanel";
import { RepairAlbumCard } from "./RepairAlbumCard";
import { RepairDetailPanel } from "./RepairDetailPanel";
import { TagSanitizerModal } from "./TagSanitizerModal";
import {
  groupTracks,
  buildUpdate,
  computeBatchFields,
  computeMixedFlags,
  trackToEditable,
  sortAlbumsByIssues,
  issuesToUpdates,
  issueKey,
  allIssueKeys,
} from "./helpers";
import type {
  TrackMetadata,
  MetadataScanProgress,
  MetadataSaveProgress,
  MetadataSaveResult,
  SanitizeProgress,
  SanitizeResult,
} from "../../../types/metadata";
import type {
  Phase,
  View,
  EditableFields,
  RepairReport,
  RepairLookupProgress,
  AlbumRepairReport,
  SanitizeModalOptions,
} from "./types";
import { useProgress } from "../../../contexts/ProgressContext";

export const MetadataEditor = () => {
  const {
    state: progressState,
    start: startProgress,
    update: updateProgress,
    finish: finishProgress,
    fail: failProgress,
  } = useProgress();
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

  // ── Drag-and-drop state ──
  const [isDragOver, setIsDragOver] = useState(false);
  const [sanitizerOpen, setSanitizerOpen] = useState(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const lastScanPaths = useRef<string[]>([]);

  // ── Repair state ──
  const [report, setReport] = useState<RepairReport | null>(null);
  const [acceptedFixes, setAcceptedFixes] = useState<Set<string>>(new Set());
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  // ── Event listeners ──
  useEffect(() => {
    let active = true;
    const unsubs: UnlistenFn[] = [];

    listen<MetadataScanProgress>("metadata-scan-progress", (e) => {
      if (active) {
        updateProgress(e.payload.completed, e.payload.total, e.payload.current_file);
      }
    }).then((fn) => {
      if (active) unsubs.push(fn);
      else fn();
    });

    listen<MetadataSaveProgress>("metadata-save-progress", (e) => {
      if (active) {
        setSaveProgress(e.payload);
        updateProgress(e.payload.completed, e.payload.total, e.payload.current_file);
      }
    }).then((fn) => {
      if (active) unsubs.push(fn);
      else fn();
    });

    listen<SanitizeProgress>("sanitize-progress", (e) => {
      if (active) {
        updateProgress(e.payload.completed, e.payload.total, e.payload.current_file);
      }
    }).then((fn) => {
      if (active) unsubs.push(fn);
      else fn();
    });

    listen<RepairLookupProgress>("repair-lookup-progress", (e) => {
      if (active) {
        updateProgress(e.payload.completed_albums, e.payload.total_albums, e.payload.current_album);
      }
    }).then((fn) => {
      if (active) unsubs.push(fn);
      else fn();
    });

    return () => {
      active = false;
      unsubs.forEach((fn) => fn());
    };
  }, []);

  // ── Drag-and-drop listener ──
  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | null = null;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (!active) return;
        if (event.payload.type === "enter") {
          setIsDragOver(true);
        } else if (event.payload.type === "leave") {
          setIsDragOver(false);
        } else if (event.payload.type === "drop") {
          setIsDragOver(false);
          const p = phaseRef.current;
          if ((p === "idle" || p === "scanned") && event.payload.paths.length > 0) {
            scanPaths(event.payload.paths);
          }
        }
      })
      .then((fn) => {
        if (active) unlisten = fn;
        else fn();
      });

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  // ── Shared actions ──

  const scanPaths = async (paths: string[]) => {
    lastScanPaths.current = paths;
    setPhase("scanning");
    setError(null);
    setSaveResult(null);
    setTracks([]);
    setEditedTracks({});
    setSelected(new Set());
    setReport(null);
    setAcceptedFixes(new Set());
    setSelectedAlbum(null);
    startProgress("Scanning metadata...", cancel);
    try {
      const data = await invoke<TrackMetadata[]>("scan_metadata_paths", { paths });
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

  const browse = async () => {
    try {
      const picked = await open({ directory: true, multiple: false, title: "Select music folder" });
      if (picked) {
        const path = picked as string;
        setScanPath(path);
        scan(path);
      }
    } catch (e) {
      setError(`Failed to open folder picker: ${e}`);
    }
  };

  const scan = async (path?: string) => {
    const targetPath = path ?? scanPath;
    lastScanPaths.current = [targetPath];
    setPhase("scanning");
    setError(null);
    setSaveResult(null);
    setTracks([]);
    setEditedTracks({});
    setSelected(new Set());
    setReport(null);
    setAcceptedFixes(new Set());
    setSelectedAlbum(null);
    startProgress("Scanning metadata...", cancel);
    try {
      const data = await invoke<TrackMetadata[]>("scan_metadata", { path: targetPath });
      setTracks(data);
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

  const cancel = async () => {
    try {
      await invoke("cancel_sync");
    } catch (_) {
      /* ignore */
    }
  };

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
      next.has(filePath) ? next.delete(filePath) : next.add(filePath);
      return next;
    });
  }, []);

  const selectGroup = useCallback((filePaths: string[]) => {
    setSelected((prev) => {
      const allSelected = filePaths.every((p) => prev.has(p));
      const next = new Set(prev);
      if (allSelected) {
        filePaths.forEach((p) => next.delete(p));
      } else {
        filePaths.forEach((p) => next.add(p));
      }
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
      for (const filePath of selected) {
        delete next[filePath];
      }
      return next;
    });
  }, [selected]);

  // Derive a common folder path from selected tracks for album art display
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
    } catch (e) {
      console.error("Failed to repair album art:", e);
    } finally {
      setRepairingArt(false);
      unlisten();
    }
  }, [selectedTracks]);

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
    startProgress("Saving metadata...", cancel);
    try {
      const result = await invoke<MetadataSaveResult>("save_metadata", { updates });
      setSaveProgress(null);
      setSaveResult(result);
      if (result.succeeded > 0) {
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

  // ── Repair logic ──

  const startRepair = async () => {
    if (tracks.length === 0) return;
    setPhase("looking_up");
    setError(null);
    setReport(null);
    setAcceptedFixes(new Set());
    setSelectedAlbum(null);
    startProgress("Looking up albums on MusicBrainz...", cancel);

    try {
      const data = await invoke<RepairReport>("repair_analyze", { tracks });
      setReport(data);
      const sorted = sortAlbumsByIssues(data.albums);
      if (sorted.length > 0) setSelectedAlbum(sorted[0].folder_path);
      setView("repair");
      setPhase("scanned");
      const totalIssues =
        data.total_issues.error_count + data.total_issues.warning_count + data.total_issues.info_count;
      finishProgress(`Found ${totalIssues} issues across ${data.albums.length} albums`);
    } catch (e) {
      const msg = `${e}`;
      if (msg === "Cancelled") {
        setPhase("scanned");
        failProgress("Lookup cancelled");
      } else {
        setError(msg);
        setPhase("scanned");
        failProgress(msg);
      }
    }
  };

  const sortedAlbums = useMemo(() => (report ? sortAlbumsByIssues(report.albums) : []), [report]);

  const selectedAlbumData = useMemo(
    () => sortedAlbums.find((a) => a.folder_path === selectedAlbum) ?? null,
    [sortedAlbums, selectedAlbum],
  );

  const totalAccepted = acceptedFixes.size;

  const toggleFix = useCallback((key: string) => {
    setAcceptedFixes((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const acceptAllForAlbum = useCallback((album: AlbumRepairReport) => {
    setAcceptedFixes((prev) => {
      const next = new Set(prev);
      for (const tm of album.track_matches) {
        for (const issue of tm.issues) {
          if (issue.suggested_value) next.add(issueKey(issue));
        }
      }
      return next;
    });
  }, []);

  const clearAllForAlbum = useCallback((album: AlbumRepairReport) => {
    setAcceptedFixes((prev) => {
      const next = new Set(prev);
      for (const tm of album.track_matches) {
        for (const issue of tm.issues) {
          next.delete(issueKey(issue));
        }
      }
      return next;
    });
  }, []);

  const handleSwitchRelease = useCallback(
    async (mbid: string) => {
      if (!selectedAlbumData) return;
      setSwitching(true);
      try {
        const localTracks = selectedAlbumData.track_matches.map((tm) => tm.local_track);
        const updated = await invoke<AlbumRepairReport>("repair_compare_release", { tracks: localTracks, mbid });
        setReport((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            albums: prev.albums.map((a) =>
              a.folder_path === selectedAlbum ? { ...updated, alternative_releases: a.alternative_releases } : a,
            ),
          };
        });
        clearAllForAlbum(selectedAlbumData);
      } catch (e) {
        setError(`Failed to switch release: ${e}`);
      } finally {
        setSwitching(false);
      }
    },
    [selectedAlbumData, selectedAlbum, clearAllForAlbum],
  );

  const handleApplyRepairs = async () => {
    if (!report || totalAccepted === 0) return;
    const updates = report.albums.flatMap((album) => issuesToUpdates(album, acceptedFixes));
    if (updates.length === 0) return;

    setPhase("saving");
    setSaveProgress(null);
    setSaveResult(null);
    startProgress("Applying fixes...", cancel);
    try {
      const result = await invoke<MetadataSaveResult>("save_metadata", { updates });
      setSaveResult(result);
      setSaveProgress(null);
      finishProgress(`Applied fixes to ${result.succeeded} of ${result.total} files`);
      if (result.succeeded > 0) {
        refreshTracks();
      } else {
        setPhase("scanned");
      }
    } catch (e) {
      setError(`${e}`);
      setPhase("scanned");
      failProgress(`${e}`);
    }
  };

  const handleAcceptAllRepairs = useCallback(() => {
    if (!report) return;
    setAcceptedFixes(allIssueKeys(report.albums));
  }, [report]);

  const handleClearAllRepairs = useCallback(() => {
    setAcceptedFixes(new Set());
  }, []);

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
      if (result.succeeded > 0) {
        refreshTracks();
      } else {
        setPhase("scanned");
      }
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
        {/* Folder picker bar */}
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

        {/* Drop zone */}
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

  // ── Scanning ──

  if (phase === "scanning") {
    return <div className="flex-1" />;
  }

  // ── Looking up (MusicBrainz) ──

  if (phase === "looking_up") {
    return <div className="flex-1" />;
  }

  // ── Scanned / Saving (main view) ──

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3 bg-bg-secondary border border-border rounded-2xl px-5 py-3 shrink-0">
        <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-widest shrink-0">Folder</span>
        <span className="flex-1 min-w-0 text-xs text-text-secondary font-medium truncate">{scanPath}</span>
        <span className="text-[11px] text-text-tertiary shrink-0">{tracks.length} tracks</span>
        <button
          onClick={browse}
          disabled={phase === "saving"}
          className="px-3 py-1.5 bg-bg-card border border-border text-text-tertiary rounded-lg text-xs shrink-0 hover:not-disabled:text-text-secondary hover:not-disabled:border-border-active disabled:opacity-30 transition-all"
        >
          Browse
        </button>
        <button
          onClick={() => scan()}
          disabled={phase === "saving"}
          className="px-3 py-1.5 bg-bg-card border border-border text-text-tertiary rounded-lg text-xs shrink-0 hover:not-disabled:text-text-secondary hover:not-disabled:border-border-active disabled:opacity-30 transition-all"
        >
          ↻ Rescan
        </button>

        {/* View toggle */}
        {report && (
          <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
            <button
              onClick={() => setView("edit")}
              className={`px-3 py-1.5 text-[11px] font-medium transition-all ${
                view === "edit" ? "bg-bg-card text-text-primary" : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              Edit
            </button>
            <button
              onClick={() => setView("repair")}
              className={`px-3 py-1.5 text-[11px] font-medium transition-all ${
                view === "repair" ? "bg-bg-card text-text-primary" : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              Repair
            </button>
          </div>
        )}

        {/* Repair button (when no report yet) */}
        {!report && phase !== "saving" && (
          <button
            onClick={startRepair}
            className="px-3 py-1.5 bg-bg-card border border-border text-text-secondary rounded-lg text-[11px] font-medium shrink-0 hover:text-text-primary hover:border-border-active transition-all"
          >
            Repair with MusicBrainz
          </button>
        )}

        {/* Editor unsaved changes */}
        {view === "edit" && dirtyCount > 0 && (
          <span className="text-[11px] font-medium text-accent shrink-0">
            {dirtyCount} unsaved {dirtyCount === 1 ? "change" : "changes"}
          </span>
        )}

        {/* Repair actions */}
        {view === "repair" && totalAccepted > 0 && (
          <>
            <button
              onClick={handleClearAllRepairs}
              className="px-3 py-1.5 bg-bg-card border border-border text-text-secondary rounded-lg text-[11px] shrink-0 hover:text-text-primary hover:border-border-active transition-all"
            >
              Clear All
            </button>
            <button
              onClick={handleApplyRepairs}
              className="px-3 py-1.5 bg-text-primary text-bg-primary rounded-lg text-[11px] font-medium shrink-0 hover:opacity-90 transition-all"
            >
              Apply {totalAccepted} {totalAccepted === 1 ? "Fix" : "Fixes"}
            </button>
          </>
        )}
        {view === "repair" &&
          totalAccepted === 0 &&
          report &&
          report.total_issues.error_count + report.total_issues.warning_count + report.total_issues.info_count > 0 && (
            <button
              onClick={handleAcceptAllRepairs}
              className="px-3 py-1.5 bg-bg-card border border-border text-text-secondary rounded-lg text-[11px] shrink-0 hover:text-text-primary hover:border-border-active transition-all"
            >
              Accept All Fixes
            </button>
          )}
      </div>

      {/* Issue summary bar (repair view only) */}
      {view === "repair" && report && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl text-[11px] bg-bg-secondary border border-border shrink-0">
          {report.total_issues.error_count > 0 && (
            <span className="text-danger">{report.total_issues.error_count} errors</span>
          )}
          {report.total_issues.warning_count > 0 && (
            <span className="text-warning">{report.total_issues.warning_count} warnings</span>
          )}
          {report.total_issues.info_count > 0 && (
            <span className="text-accent">{report.total_issues.info_count} info</span>
          )}
          {report.total_issues.error_count === 0 &&
            report.total_issues.warning_count === 0 &&
            report.total_issues.info_count === 0 && <span className="text-success">All metadata looks good</span>}
        </div>
      )}

      {/* Save result toast */}
      {saveResult && (
        <div
          className={`px-3 py-2 rounded-xl text-[11px] leading-relaxed shrink-0 ${
            saveResult.cancelled
              ? "bg-warning/10 text-warning"
              : saveResult.failed > 0
                ? "bg-warning/10 text-warning"
                : "bg-success/10 text-success"
          }`}
        >
          {saveResult.cancelled
            ? `Cancelled — saved ${saveResult.succeeded} of ${saveResult.total} files before stopping`
            : `Saved ${saveResult.succeeded} of ${saveResult.total} files`}
          {!saveResult.cancelled && saveResult.failed > 0 && ` — ${saveResult.failed} failed`}
          {saveResult.errors.length > 0 && (
            <div className="mt-1 text-[10px] opacity-70">
              {saveResult.errors.slice(0, 3).map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Save progress */}
      {phase === "saving" && !progressState.active && (
        <div className="px-4 py-3 bg-bg-secondary border border-border rounded-2xl shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-text-secondary font-medium">
              <Spinner /> Saving metadata...
            </div>
            <button
              onClick={cancel}
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

      {error && <div className="px-3 py-2 rounded-xl text-[11px] bg-danger/10 text-danger shrink-0">{error}</div>}

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

        {view === "repair" && report && (
          <>
            {/* Album list */}
            <div className="w-72 shrink-0 bg-bg-secondary border border-border rounded-2xl flex flex-col min-h-0">
              <div className="px-4 py-3 border-b border-border shrink-0">
                <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-widest">
                  Albums ({sortedAlbums.length})
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-1.5">
                {sortedAlbums.map((album) => (
                  <RepairAlbumCard
                    key={album.folder_path}
                    album={album}
                    selected={selectedAlbum === album.folder_path}
                    onClick={() => setSelectedAlbum(album.folder_path)}
                  />
                ))}
              </div>
            </div>

            {/* Detail panel */}
            {selectedAlbumData ? (
              <RepairDetailPanel
                album={selectedAlbumData}
                acceptedFixes={acceptedFixes}
                onToggleFix={toggleFix}
                onAcceptAll={() => acceptAllForAlbum(selectedAlbumData)}
                onClearAll={() => clearAllForAlbum(selectedAlbumData)}
                onSwitchRelease={handleSwitchRelease}
                switching={switching}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center bg-bg-secondary border border-border rounded-2xl">
                <span className="text-text-tertiary text-xs">Select an album to see details</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Drag-over overlay for re-dropping in scanned state */}
      {isDragOver && phase === "scanned" && (
        <div className="absolute inset-0 bg-accent/5 border-2 border-dashed border-accent rounded-2xl flex items-center justify-center pointer-events-none z-40">
          <span className="text-accent text-xs font-medium">Drop to rescan</span>
        </div>
      )}

      {/* Tag Sanitizer modal */}
      {sanitizerOpen && (
        <TagSanitizerModal
          selectedCount={selected.size}
          onStart={handleSanitize}
          onClose={() => setSanitizerOpen(false)}
        />
      )}
    </>
  );
};
