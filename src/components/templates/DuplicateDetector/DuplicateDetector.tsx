import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useToast } from "../../../contexts/ToastContext";
import { ConfirmDialog } from "../../atoms/ConfirmDialog/ConfirmDialog";
import { formatSize, formatDuration } from "./helpers";
import type { DuplicateDetectionResult, DuplicateDetectionProgress, DuplicateGroup } from "../../../types/library";

export const DuplicateDetector = () => {
  const toast = useToast();
  const [result, setResult] = useState<DuplicateDetectionResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<DuplicateDetectionProgress | null>(null);
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setResult(null);
    setSelectedForDeletion(new Set());

    const unlisten = await listen<DuplicateDetectionProgress>("duplicate-detection-progress", (e) => {
      setProgress(e.payload);
    });

    try {
      const res = await invoke<DuplicateDetectionResult>("detect_duplicates");
      setResult(res);
      // Pre-select non-recommended tracks for deletion
      const toDelete = new Set<number>();
      for (const group of res.groups) {
        for (const dt of group.tracks) {
          if (!dt.is_recommended) {
            toDelete.add(dt.track.id);
          }
        }
      }
      setSelectedForDeletion(toDelete);
    } catch (e) {
      const msg = `${e}`;
      if (!msg.includes("Cancelled")) {
        toast.error(`Duplicate detection failed: ${e}`);
      }
    } finally {
      unlisten();
      setScanning(false);
      setProgress(null);
    }
  }, [toast]);

  const toggleTrack = useCallback((trackId: number) => {
    setSelectedForDeletion((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });
  }, []);

  const selectAllDuplicates = useCallback(() => {
    if (!result) return;
    const toDelete = new Set<number>();
    for (const group of result.groups) {
      for (const dt of group.tracks) {
        if (!dt.is_recommended) {
          toDelete.add(dt.track.id);
        }
      }
    }
    setSelectedForDeletion(toDelete);
  }, [result]);

  const deselectAll = useCallback(() => {
    setSelectedForDeletion(new Set());
  }, []);

  const handleDelete = useCallback(async () => {
    setConfirmDelete(false);
    setDeleting(true);
    try {
      const ids = Array.from(selectedForDeletion);
      await invoke("delete_duplicate_tracks", { trackIds: ids });
      // Re-scan after deletion
      await handleScan();
    } catch (e) {
      toast.error(`Failed to delete tracks: ${e}`);
    } finally {
      setDeleting(false);
    }
  }, [selectedForDeletion, handleScan, toast]);

  const selectedSize = result
    ? result.groups
        .flatMap((g) => g.tracks)
        .filter((dt) => selectedForDeletion.has(dt.track.id))
        .reduce((sum, dt) => sum + dt.track.file_size, 0)
    : 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div>
          <h2 className="text-sm font-medium text-text-primary">Duplicate Detection</h2>
          <p className="text-[10px] text-text-tertiary mt-0.5">
            Find duplicate tracks across formats (FLAC, MP3, etc.)
          </p>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning || deleting}
          className="px-4 py-1.5 bg-text-primary text-bg-primary rounded-lg text-[11px] font-medium transition-all hover:not-disabled:opacity-90 disabled:opacity-40"
        >
          {scanning ? "Scanning..." : "Scan for Duplicates"}
        </button>
      </div>

      {/* Progress */}
      {scanning && progress && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-bg-card shrink-0">
          <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-[11px] text-text-secondary">
            {progress.phase}... {progress.completed}/{progress.total}
          </span>
        </div>
      )}

      {/* Summary */}
      {result && !scanning && (
        <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border bg-bg-card shrink-0">
          <span className="text-[11px] text-text-secondary">
            <strong className="text-text-primary">{result.groups.length}</strong> duplicate group
            {result.groups.length !== 1 ? "s" : ""}
          </span>
          <span className="text-[11px] text-text-secondary">
            <strong className="text-text-primary">{result.total_duplicate_tracks}</strong> total tracks
          </span>
          <span className="text-[11px] text-text-secondary">
            <strong className="text-text-primary">{formatSize(result.potential_space_savings)}</strong> potential
            savings
          </span>
        </div>
      )}

      {/* Groups list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {!result && !scanning && (
          <div className="flex items-center justify-center h-full">
            <p className="text-[11px] text-text-tertiary">Click "Scan for Duplicates" to find duplicate tracks</p>
          </div>
        )}

        {result && result.groups.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-[11px] text-text-tertiary">No duplicates found</p>
          </div>
        )}

        {result?.groups.map((group) => (
          <DuplicateGroupCard
            key={group.group_id}
            group={group}
            selectedForDeletion={selectedForDeletion}
            onToggle={toggleTrack}
          />
        ))}
      </div>

      {/* Action bar */}
      {result && result.groups.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-border bg-bg-card shrink-0">
          <button
            onClick={selectAllDuplicates}
            className="text-[11px] text-accent hover:text-accent/80 transition-colors"
          >
            Select All Duplicates
          </button>
          <button
            onClick={deselectAll}
            className="text-[11px] text-text-tertiary hover:text-text-secondary transition-colors"
          >
            Deselect All
          </button>
          <div className="flex-1" />
          {selectedForDeletion.size > 0 && (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={deleting}
              className="px-4 py-1.5 bg-danger text-white rounded-lg text-[11px] font-medium transition-all hover:not-disabled:opacity-90 disabled:opacity-40"
            >
              {deleting ? "Deleting..." : `Delete ${selectedForDeletion.size} tracks (${formatSize(selectedSize)})`}
            </button>
          )}
        </div>
      )}

      {/* Confirm dialog */}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete Duplicate Tracks"
          message={`This will permanently delete ${selectedForDeletion.size} track${selectedForDeletion.size !== 1 ? "s" : ""} (${formatSize(selectedSize)}) from your library. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
};

// ── Duplicate group card ────────────────────────────────────

const DuplicateGroupCard = ({
  group,
  selectedForDeletion,
  onToggle,
}: {
  group: DuplicateGroup;
  selectedForDeletion: Set<number>;
  onToggle: (id: number) => void;
}) => {
  const title = group.tracks[0]?.track.title ?? group.fingerprint;
  const artist = group.tracks[0]?.track.artist ?? "Unknown";

  return (
    <div className="border border-border rounded-xl bg-bg-card overflow-hidden">
      {/* Group header */}
      <div className="px-3 py-2 border-b border-border bg-bg-secondary flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-text-primary truncate">{title}</div>
          <div className="text-[10px] text-text-tertiary truncate">{artist}</div>
        </div>
        {group.duration_mismatch && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-yellow-500/10 text-yellow-500 shrink-0">
            Duration mismatch
          </span>
        )}
        <span className="text-[10px] text-text-tertiary shrink-0">{group.tracks.length} copies</span>
      </div>

      {/* Track rows */}
      <div className="divide-y divide-border">
        {group.tracks.map((dt) => (
          <div
            key={dt.track.id}
            className={`flex items-center gap-2 px-3 py-1.5 text-[11px] ${
              selectedForDeletion.has(dt.track.id) ? "bg-danger/5" : ""
            }`}
          >
            <input
              type="checkbox"
              checked={selectedForDeletion.has(dt.track.id)}
              onChange={() => onToggle(dt.track.id)}
              className="shrink-0 accent-accent"
            />
            {dt.is_recommended && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-success/10 text-success shrink-0">
                Best
              </span>
            )}
            <span className="text-text-secondary font-medium shrink-0 w-10">{dt.track.format}</span>
            <span className="text-text-tertiary tabular-nums shrink-0 w-16">
              {dt.track.bitrate_kbps ? `${dt.track.bitrate_kbps}k` : "—"}
            </span>
            <span className="text-text-tertiary tabular-nums shrink-0 w-12">
              {dt.track.sample_rate ? `${(dt.track.sample_rate / 1000).toFixed(1)}k` : "—"}
            </span>
            <span className="text-text-tertiary tabular-nums shrink-0 w-12">
              {formatDuration(dt.track.duration_secs)}
            </span>
            <span className="text-text-tertiary tabular-nums shrink-0 w-14">{formatSize(dt.track.file_size)}</span>
            <span className="flex-1 text-text-tertiary truncate text-[10px]" title={dt.track.file_path}>
              {dt.track.file_name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
