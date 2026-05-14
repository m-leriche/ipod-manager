import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Spinner } from "../../atoms/Spinner/Spinner";
import { useArtCache } from "../../../contexts/ArtCacheContext";
import type { AlbumInfo, AlbumArtResult } from "../../../types/albumart";

type Phase = "scanning" | "summary" | "review" | "fixing" | "done";

interface Props {
  musicPath: string;
  onClose: () => void;
}

interface ScanProgress {
  albums_found: number;
  current_folder: string;
}

interface FixProgress {
  total: number;
  completed: number;
  current_album: string;
}

export const IpodArtRepairModal = ({ musicPath, onClose }: Props) => {
  const { bumpArtCache } = useArtCache();
  const [phase, setPhase] = useState<Phase>("scanning");
  const [albums, setAlbums] = useState<AlbumInfo[]>([]);
  const [scanProgress, setScanProgress] = useState<ScanProgress>({ albums_found: 0, current_folder: "" });
  const [fixProgress, setFixProgress] = useState<FixProgress>({ total: 0, completed: 0, current_album: "" });
  const [result, setResult] = useState<AlbumArtResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Scan on mount
  useEffect(() => {
    let unlistenScan: (() => void) | null = null;

    const run = async () => {
      unlistenScan = await listen<ScanProgress>("albumart-scan-progress", (e) => {
        if (mountedRef.current) setScanProgress(e.payload);
      });

      try {
        const results = await invoke<AlbumInfo[]>("scan_album_art", { path: musicPath });
        if (!mountedRef.current) return;
        setAlbums(results);
        const missing = results.filter((a) => !a.has_cover_file);
        setSelected(new Set(missing.map((a) => a.folder_path)));
        setPhase(missing.length === 0 ? "done" : "summary");
        if (missing.length === 0) {
          setResult({ total: 0, fixed: 0, already_ok: results.length, failed: 0, cancelled: false, errors: [] });
        }
      } catch (e) {
        if (!mountedRef.current) return;
        const msg = `${e}`;
        if (msg.includes("Cancelled")) {
          onCloseRef.current();
          return;
        }
        setError(msg);
        setPhase("done");
      } finally {
        unlistenScan?.();
      }
    };

    run();
    return () => {
      unlistenScan?.();
    };
  }, [musicPath]);

  const missingAlbums = albums.filter((a) => !a.has_cover_file);

  const runFix = useCallback(
    async (folders: string[]) => {
      if (folders.length === 0) return;
      setPhase("fixing");
      setFixProgress({ total: folders.length, completed: 0, current_album: "" });

      const unlisten = await listen<FixProgress>("albumart-progress", (e) => {
        if (mountedRef.current) setFixProgress(e.payload);
      });

      try {
        const res = await invoke<AlbumArtResult>("fix_album_art", { folders });
        if (mountedRef.current) {
          setResult(res);
          setPhase("done");
          bumpArtCache();
        }
      } catch (e) {
        if (mountedRef.current) {
          setError(`${e}`);
          setPhase("done");
        }
      } finally {
        unlisten();
      }
    },
    [bumpArtCache],
  );

  const handleCancel = useCallback(() => {
    invoke("cancel_sync").catch(() => {});
  }, []);

  const handleFixAll = () => runFix(missingAlbums.map((a) => a.folder_path));
  const handleFixSelected = () => runFix([...selected]);
  const handleReview = () => setPhase("review");

  const toggleAlbum = (folderPath: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === missingAlbums.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(missingAlbums.map((a) => a.folder_path)));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={phase === "scanning" || phase === "fixing" ? undefined : onClose}
      />
      <div className="relative bg-bg-secondary border border-border rounded-2xl shadow-xl w-[480px] max-w-[90vw] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b border-border">
          <h2 className="text-sm font-medium text-text-primary">iPod Album Art Repair</h2>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          {phase === "scanning" && <ScanningView progress={scanProgress} />}
          {phase === "summary" && <SummaryView total={albums.length} missing={missingAlbums.length} />}
          {phase === "review" && (
            <ReviewView albums={missingAlbums} selected={selected} onToggle={toggleAlbum} onToggleAll={toggleAll} />
          )}
          {phase === "fixing" && <FixingView progress={fixProgress} />}
          {phase === "done" && <DoneView result={result} error={error} totalScanned={albums.length} />}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
          {(phase === "scanning" || phase === "fixing") && (
            <ModalButton label="Cancel" variant="secondary" onClick={handleCancel} />
          )}
          {phase === "summary" && (
            <>
              <ModalButton label="Review" variant="secondary" onClick={handleReview} />
              <ModalButton label={`Fix All (${missingAlbums.length})`} onClick={handleFixAll} />
            </>
          )}
          {phase === "review" && (
            <>
              <ModalButton label="Back" variant="secondary" onClick={() => setPhase("summary")} />
              <ModalButton
                label={`Fix Selected (${selected.size})`}
                onClick={handleFixSelected}
                disabled={selected.size === 0}
              />
            </>
          )}
          {phase === "done" && <ModalButton label="Close" onClick={onClose} />}
        </div>
      </div>
    </div>
  );
};

// ── Sub-views ──────────────────────────────────────────────────

const ScanningView = ({ progress }: { progress: ScanProgress }) => (
  <div className="flex flex-col items-center gap-3 py-6">
    <div className="flex items-center gap-2 text-text-secondary text-xs">
      <Spinner />
      Scanning iPod for albums...
    </div>
    <div className="w-full bg-bg-card border border-border rounded-full h-2 overflow-hidden">
      <div className="h-full bg-accent rounded-full animate-pulse w-full" />
    </div>
    {progress.albums_found > 0 && (
      <p className="text-[11px] text-text-tertiary">
        {progress.albums_found} album{progress.albums_found !== 1 ? "s" : ""} found
      </p>
    )}
    {progress.current_folder && (
      <p className="text-[11px] text-text-tertiary truncate max-w-full">{progress.current_folder}</p>
    )}
  </div>
);

const SummaryView = ({ total, missing }: { total: number; missing: number }) => (
  <div className="py-4">
    <div className="grid grid-cols-2 gap-3 mb-4">
      <StatCard label="Albums Found" value={total} />
      <StatCard label="Missing Art" value={missing} accent />
    </div>
    <p className="text-xs text-text-tertiary leading-relaxed">
      {missing} album{missing !== 1 ? "s" : ""} on your iPod {missing !== 1 ? "are" : "is"} missing cover art. Fix all
      at once, or review the list to choose which albums to repair.
    </p>
  </div>
);

const StatCard = ({ label, value, accent }: { label: string; value: number; accent?: boolean }) => (
  <div className="bg-bg-card border border-border rounded-xl px-4 py-3 text-center">
    <div className={`text-lg font-semibold ${accent ? "text-accent" : "text-text-primary"}`}>{value}</div>
    <div className="text-[10px] text-text-tertiary uppercase tracking-wider mt-0.5">{label}</div>
  </div>
);

const ReviewView = ({
  albums,
  selected,
  onToggle,
  onToggleAll,
}: {
  albums: AlbumInfo[];
  selected: Set<string>;
  onToggle: (path: string) => void;
  onToggleAll: () => void;
}) => (
  <div>
    <div className="flex items-center justify-between mb-2">
      <span className="text-[11px] text-text-tertiary">
        {selected.size} of {albums.length} selected
      </span>
      <button onClick={onToggleAll} className="text-[11px] text-accent hover:underline">
        {selected.size === albums.length ? "Deselect All" : "Select All"}
      </button>
    </div>
    <div className="space-y-1 max-h-[40vh] overflow-y-auto">
      {albums.map((album) => (
        <label
          key={album.folder_path}
          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-hover cursor-pointer"
        >
          <input
            type="checkbox"
            checked={selected.has(album.folder_path)}
            onChange={() => onToggle(album.folder_path)}
            className="accent-accent w-3.5 h-3.5 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="text-xs text-text-primary truncate">
              {album.artist ?? "Unknown Artist"} — {album.album ?? album.folder_name}
            </div>
            <div className="text-[10px] text-text-tertiary">
              {album.track_count} track{album.track_count !== 1 ? "s" : ""}
              {album.has_embedded_art && " · has embedded art"}
            </div>
          </div>
        </label>
      ))}
    </div>
  </div>
);

const FixingView = ({ progress }: { progress: FixProgress }) => {
  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <div className="flex items-center gap-2 text-text-secondary text-xs">
        <Spinner />
        Repairing album art...
      </div>
      <div className="w-full bg-bg-card border border-border rounded-full h-2 overflow-hidden">
        <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-text-tertiary">
        {progress.completed} / {progress.total}
      </p>
      {progress.current_album && (
        <p className="text-[11px] text-text-tertiary truncate max-w-full">{progress.current_album}</p>
      )}
    </div>
  );
};

const DoneView = ({
  result,
  error,
  totalScanned,
}: {
  result: AlbumArtResult | null;
  error: string | null;
  totalScanned: number;
}) => {
  if (error) {
    return (
      <div className="py-4 text-center">
        <p className="text-xs text-danger">{error}</p>
      </div>
    );
  }
  if (!result) return null;

  if (result.total === 0 && totalScanned > 0) {
    return (
      <div className="py-4 text-center">
        <p className="text-xs text-text-secondary">All {totalScanned} albums on your iPod already have cover art.</p>
      </div>
    );
  }

  return (
    <div className="py-4">
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="Fixed" value={result.fixed} accent />
        <StatCard label="Not Found" value={result.failed} />
        <StatCard label="Already OK" value={result.already_ok} />
      </div>
      {result.cancelled && <p className="text-xs text-text-tertiary text-center">Repair was cancelled.</p>}
    </div>
  );
};

// ── Shared button ──────────────────────────────────────────────

const ModalButton = ({
  label,
  variant = "primary",
  onClick,
  disabled,
}: {
  label: string;
  variant?: "primary" | "secondary";
  onClick: () => void;
  disabled?: boolean;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={
      variant === "primary"
        ? "px-4 py-2 bg-text-primary text-bg-primary rounded-xl text-xs font-medium transition-all hover:not-disabled:opacity-90 disabled:opacity-20 disabled:cursor-not-allowed"
        : "px-4 py-2 bg-bg-card border border-border text-text-secondary rounded-xl text-xs font-medium transition-all hover:not-disabled:bg-bg-hover hover:not-disabled:text-text-primary disabled:opacity-20 disabled:cursor-not-allowed"
    }
  >
    {label}
  </button>
);
