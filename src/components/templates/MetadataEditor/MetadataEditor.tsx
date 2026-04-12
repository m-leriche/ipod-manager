import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderPicker } from "../../atoms/FolderPicker/FolderPicker";
import { Spinner } from "../../atoms/Spinner/Spinner";
import { MetadataTree } from "./MetadataTree";
import { MetadataEditPanel } from "./MetadataEditPanel";
import {
  groupTracks,
  buildUpdate,
  computeBatchFields,
  computeMixedFlags,
  trackToEditable,
  countTheArtists,
  fixTheArtists,
} from "./helpers";
import type { TrackMetadata, MetadataScanProgress, MetadataSaveResult } from "../../../types/metadata";
import type { Phase, EditableFields } from "./types";

export const MetadataEditor = () => {
  const [phase, setPhase] = useState<Phase>("idle");
  const [scanPath, setScanPath] = useState("");
  const [tracks, setTracks] = useState<TrackMetadata[]>([]);
  const [editedTracks, setEditedTracks] = useState<Record<string, EditableFields>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanProgress, setScanProgress] = useState<MetadataScanProgress | null>(null);
  const [saveResult, setSaveResult] = useState<MetadataSaveResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const unsubs: UnlistenFn[] = [];
    listen<MetadataScanProgress>("metadata-scan-progress", (e) => {
      if (active) setScanProgress(e.payload);
    }).then((fn) => {
      if (active) unsubs.push(fn);
      else fn();
    });
    return () => {
      active = false;
      unsubs.forEach((fn) => fn());
    };
  }, []);

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
    setPhase("scanning");
    setError(null);
    setSaveResult(null);
    setTracks([]);
    setEditedTracks({});
    setSelected(new Set());
    setScanProgress(null);
    try {
      const data = await invoke<TrackMetadata[]>("scan_metadata", { path: targetPath });
      setTracks(data);
      setPhase("scanned");
    } catch (e) {
      setError(`${e}`);
      setPhase("idle");
    }
  };

  const groups = useMemo(() => groupTracks(tracks, editedTracks), [tracks, editedTracks]);
  const theArtistCount = useMemo(() => countTheArtists(tracks), [tracks]);

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

  const handleFixTheArtists = useCallback(() => {
    setEditedTracks((prev) => fixTheArtists(tracks, prev));
  }, [tracks]);

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
    try {
      const result = await invoke<MetadataSaveResult>("save_metadata", { updates });
      setSaveResult(result);
      if (result.succeeded > 0) {
        // Update tracks in-place with saved values
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
    } catch (e) {
      setError(`${e}`);
      setPhase("scanned");
    }
  };

  // ── Idle ──

  if (phase === "idle") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <p className="text-text-tertiary text-xs mb-4">Choose a music folder to view and edit metadata</p>
          <div className="mb-4">
            <FolderPicker label="Folder" path={scanPath || null} onBrowse={browse} />
          </div>
          <button
            onClick={() => scan()}
            disabled={!scanPath}
            className="px-5 py-2.5 bg-text-primary text-bg-primary rounded-xl text-xs font-medium transition-all hover:not-disabled:opacity-90 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            Scan Metadata
          </button>
          {error && <p className="mt-3 text-danger text-[11px]">{error}</p>}
        </div>
      </div>
    );
  }

  // ── Scanning ──

  if (phase === "scanning") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-text-tertiary text-xs mb-1">
            <Spinner /> Scanning metadata...
          </div>
          {scanProgress && (
            <>
              <div className="text-[11px] text-text-secondary font-medium">
                {scanProgress.completed} of {scanProgress.total} files
              </div>
              <div className="text-[10px] text-text-tertiary mt-1 max-w-xs truncate mx-auto">
                {scanProgress.current_file}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Scanned / Saving ──

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3 bg-bg-secondary border border-border rounded-2xl px-5 py-3 shrink-0">
        <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-widest shrink-0">Folder</span>
        <span className="flex-1 min-w-0 text-xs text-text-secondary font-medium truncate">{scanPath}</span>
        <span className="text-[11px] text-text-tertiary shrink-0">{tracks.length} tracks</span>
        {theArtistCount > 0 && (
          <button
            onClick={handleFixTheArtists}
            className="px-3 py-1.5 bg-bg-card border border-border text-text-secondary rounded-lg text-[11px] font-medium shrink-0 hover:text-text-primary hover:border-border-active transition-all"
          >
            Fix &quot;The&quot; Artists ({theArtistCount})
          </button>
        )}
        <button
          onClick={() => scan()}
          disabled={phase === "saving"}
          className="px-3 py-1.5 bg-bg-card border border-border text-text-tertiary rounded-lg text-xs shrink-0 hover:not-disabled:text-text-secondary hover:not-disabled:border-border-active disabled:opacity-30 transition-all"
        >
          ↻ Rescan
        </button>
      </div>

      {/* Save result toast */}
      {saveResult && (
        <div
          className={`px-3 py-2 rounded-xl text-[11px] leading-relaxed shrink-0 ${
            saveResult.failed > 0 ? "bg-warning/10 text-warning" : "bg-success/10 text-success"
          }`}
        >
          Saved {saveResult.succeeded} of {saveResult.total} files
          {saveResult.failed > 0 && ` — ${saveResult.failed} failed`}
          {saveResult.errors.length > 0 && (
            <div className="mt-1 text-[10px] opacity-70">
              {saveResult.errors.slice(0, 3).map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <div className="px-3 py-2 rounded-xl text-[11px] bg-danger/10 text-danger shrink-0">{error}</div>}

      {/* Main content: tree + edit panel */}
      <div className="flex-1 flex gap-3 min-h-0">
        <MetadataTree
          groups={groups}
          editedTracks={editedTracks}
          selected={selected}
          onToggleTrack={toggleTrack}
          onSelectAlbum={selectGroup}
          onSelectArtist={selectGroup}
        />

        {selected.size > 0 && batchFields && mixedFlags && (
          <MetadataEditPanel
            fields={batchFields}
            mixed={mixedFlags}
            selectedCount={selected.size}
            dirtyCount={dirtyCount}
            saving={phase === "saving"}
            onFieldChange={handleFieldChange}
            onSave={handleSave}
            onRevert={handleRevert}
          />
        )}
      </div>
    </>
  );
};
