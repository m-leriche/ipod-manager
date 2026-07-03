import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Spinner } from "../../atoms/Spinner/Spinner";
import { useToast } from "../../../contexts/ToastContext";
import { formatBytes } from "../../../utils/format";
import { cancelSync } from "../../../utils/cancelSync";
import { CapacityBar } from "./CapacityBar";
import { playlistKey, splitSelection } from "./helpers";
import type { Playlist, SmartPlaylist } from "../../../types/library";
import type {
  SyncPhase,
  PlaylistSyncModalProps,
  PlaylistSyncPlan,
  PlaylistSyncResult,
  SyncProgressPayload,
} from "./types";

export const PlaylistSyncModal = ({ info, onClose }: PlaylistSyncModalProps) => {
  const toast = useToast();
  const [phase, setPhase] = useState<SyncPhase>("select");
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [smartPlaylists, setSmartPlaylists] = useState<SmartPlaylist[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [plan, setPlan] = useState<PlaylistSyncPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SyncProgressPayload | null>(null);
  const [result, setResult] = useState<PlaylistSyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Load playlists on mount
  useEffect(() => {
    const load = async () => {
      try {
        const [regular, smart] = await Promise.all([
          invoke<Playlist[]>("get_playlists"),
          invoke<SmartPlaylist[]>("get_smart_playlists"),
        ]);
        setPlaylists(regular);
        setSmartPlaylists(smart);
      } catch (e) {
        setPlanError(`${e}`);
      }
    };
    load();
  }, []);

  // Preflight plan whenever the selection changes
  const planIdRef = useRef(0);
  useEffect(() => {
    const id = ++planIdRef.current;
    if (selected.size === 0) {
      setPlan(null);
      setPlanError(null);
      return;
    }
    const { playlistIds, smartPlaylistIds } = splitSelection(selected);
    setPlanning(true);
    invoke<PlaylistSyncPlan>("plan_playlist_sync", {
      playlistIds,
      smartPlaylistIds,
      mountPoint: info.mount_point,
    })
      .then((p) => {
        if (planIdRef.current !== id) return;
        setPlan(p);
        setPlanError(null);
      })
      .catch((e) => {
        if (planIdRef.current !== id) return;
        setPlan(null);
        setPlanError(`${e}`);
      })
      .finally(() => {
        if (planIdRef.current === id) setPlanning(false);
      });
  }, [selected, info.mount_point]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const overCapacity = plan !== null && plan.bytes_to_copy > plan.free_space;

  const runSync = useCallback(async () => {
    const { playlistIds, smartPlaylistIds } = splitSelection(selected);
    setPhase("syncing");
    setProgress(null);

    const unlisten = await listen<SyncProgressPayload>("sync-progress", (e) => setProgress(e.payload));
    try {
      const res = await invoke<PlaylistSyncResult>("sync_playlists_to_ipod", {
        playlistIds,
        smartPlaylistIds,
        mountPoint: info.mount_point,
      });
      setResult(res);
      setPhase("done");
      if (res.cancelled) {
        toast.info("Playlist sync cancelled");
      } else if (res.errors.length > 0) {
        toast.warning(`Playlist sync finished with ${res.errors.length} error${res.errors.length !== 1 ? "s" : ""}`);
      } else {
        toast.success(
          `Synced ${res.playlists_written} playlist${res.playlists_written !== 1 ? "s" : ""} — ${res.copied} track${res.copied !== 1 ? "s" : ""} copied`,
        );
      }
    } catch (e) {
      setSyncError(`${e}`);
      setPhase("done");
      toast.error(`Playlist sync failed: ${e}`);
    } finally {
      unlisten();
    }
  }, [selected, info.mount_point, toast]);

  const usedSpace = info.audio_space + info.other_space;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={phase === "syncing" ? undefined : onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="playlist-sync-title"
        className="relative bg-bg-secondary border border-border rounded-2xl shadow-xl w-[480px] max-w-[90vw] max-h-[80vh] flex flex-col"
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b border-border">
          <h2 id="playlist-sync-title" className="text-sm font-medium text-text-primary">
            Sync Playlists to iPod
          </h2>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          {phase === "select" && (
            <SelectView
              playlists={playlists}
              smartPlaylists={smartPlaylists}
              selected={selected}
              onToggle={toggle}
              plan={plan}
              planning={planning}
              planError={planError}
              overCapacity={overCapacity}
              totalSpace={info.total_space}
              usedSpace={usedSpace}
            />
          )}
          {phase === "syncing" && <SyncingView progress={progress} />}
          {phase === "done" && <DoneView result={result} error={syncError} />}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
          {phase === "select" && (
            <>
              <ModalButton label="Cancel" variant="secondary" onClick={onClose} />
              <ModalButton
                label={`Sync ${selected.size > 0 ? `(${selected.size})` : ""}`.trim()}
                onClick={runSync}
                disabled={selected.size === 0 || planning || plan === null || overCapacity}
              />
            </>
          )}
          {phase === "syncing" && <ModalButton label="Cancel" variant="secondary" onClick={() => cancelSync()} />}
          {phase === "done" && <ModalButton label="Close" onClick={onClose} />}
        </div>
      </div>
    </div>
  );
};

// ── Sub-views ──────────────────────────────────────────────────

const SelectView = ({
  playlists,
  smartPlaylists,
  selected,
  onToggle,
  plan,
  planning,
  planError,
  overCapacity,
  totalSpace,
  usedSpace,
}: {
  playlists: Playlist[];
  smartPlaylists: SmartPlaylist[];
  selected: Set<string>;
  onToggle: (key: string) => void;
  plan: PlaylistSyncPlan | null;
  planning: boolean;
  planError: string | null;
  overCapacity: boolean;
  totalSpace: number;
  usedSpace: number;
}) => {
  if (playlists.length === 0 && smartPlaylists.length === 0) {
    return <p className="text-xs text-text-tertiary py-4 text-center">No playlists in your library yet.</p>;
  }

  const planCount = (id: number, isSmart: boolean): number | null =>
    plan?.playlists.find((p) => p.id === id && p.is_smart === isSmart)?.track_count ?? null;

  return (
    <div>
      <p className="text-[11px] text-text-tertiary mb-2">
        Choose playlists to copy to your iPod. Tracks already on the device are skipped.
      </p>
      <div className="space-y-1 max-h-[32vh] overflow-y-auto mb-4">
        {playlists.map((pl) => (
          <PlaylistRow
            key={playlistKey(pl.id, false)}
            name={pl.name}
            trackCount={pl.track_count}
            isSmart={false}
            checked={selected.has(playlistKey(pl.id, false))}
            onToggle={() => onToggle(playlistKey(pl.id, false))}
          />
        ))}
        {smartPlaylists.map((sp) => (
          <PlaylistRow
            key={playlistKey(sp.id, true)}
            name={sp.name}
            trackCount={planCount(sp.id, true)}
            isSmart
            checked={selected.has(playlistKey(sp.id, true))}
            onToggle={() => onToggle(playlistKey(sp.id, true))}
          />
        ))}
      </div>

      <div className="bg-bg-card border border-border rounded-xl px-4 py-3">
        <div className="flex justify-between items-center mb-2">
          <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest">Capacity</span>
          {planning && <Spinner />}
        </div>
        <CapacityBar totalSpace={totalSpace} usedSpace={usedSpace} pendingBytes={plan?.bytes_to_copy ?? 0} />
        {plan && (
          <p className="text-[11px] text-text-tertiary mt-2.5">
            {plan.total_tracks} track{plan.total_tracks !== 1 ? "s" : ""} selected · {formatBytes(plan.bytes_to_copy)}{" "}
            to copy · {formatBytes(plan.bytes_already_present)} already on iPod
          </p>
        )}
        {overCapacity && plan && (
          <p className="text-[11px] text-danger mt-1.5">
            Not enough free space: {formatBytes(plan.bytes_to_copy)} needed, {formatBytes(plan.free_space)} free.
          </p>
        )}
        {planError && <p className="text-[11px] text-danger mt-1.5">{planError}</p>}
      </div>
    </div>
  );
};

const PlaylistRow = ({
  name,
  trackCount,
  isSmart,
  checked,
  onToggle,
}: {
  name: string;
  trackCount: number | null;
  isSmart: boolean;
  checked: boolean;
  onToggle: () => void;
}) => (
  <label className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-hover cursor-pointer">
    <input type="checkbox" checked={checked} onChange={onToggle} className="accent-accent w-3.5 h-3.5 shrink-0" />
    <div className="min-w-0 flex-1 flex items-center gap-2">
      <span className="text-xs text-text-primary truncate">{name}</span>
      {isSmart && (
        <span className="px-1.5 py-0.5 rounded-md bg-accent/15 text-accent text-[10px] font-medium shrink-0">
          Smart
        </span>
      )}
    </div>
    <span className="text-[10px] text-text-tertiary shrink-0">
      {trackCount !== null ? `${trackCount} track${trackCount !== 1 ? "s" : ""}` : ""}
    </span>
  </label>
);

const SyncingView = ({ progress }: { progress: SyncProgressPayload | null }) => {
  const pct = progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <div className="flex items-center gap-2 text-text-secondary text-xs">
        <Spinner />
        Copying tracks to iPod...
      </div>
      <div className="w-full bg-bg-card border border-border rounded-full h-2 overflow-hidden">
        <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      {progress && (
        <p className="text-[11px] text-text-tertiary">
          {progress.completed} / {progress.total}
        </p>
      )}
      {progress?.current_file && (
        <p className="text-[11px] text-text-tertiary truncate max-w-full">{progress.current_file}</p>
      )}
    </div>
  );
};

const DoneView = ({ result, error }: { result: PlaylistSyncResult | null; error: string | null }) => {
  if (error) {
    return (
      <div className="py-4 text-center">
        <p className="text-xs text-danger">{error}</p>
      </div>
    );
  }
  if (!result) return null;

  return (
    <div className="py-4">
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="Copied" value={result.copied} accent />
        <StatCard label="Already There" value={result.already_present} />
        <StatCard label="Playlists" value={result.playlists_written} />
      </div>
      {result.cancelled && <p className="text-xs text-text-tertiary text-center mb-2">Sync was cancelled.</p>}
      {result.errors.length > 0 && (
        <div className="max-h-[20vh] overflow-y-auto space-y-1">
          {result.errors.map((e, i) => (
            <p key={i} className="text-[11px] text-danger">
              {e}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};

const StatCard = ({ label, value, accent }: { label: string; value: number; accent?: boolean }) => (
  <div className="bg-bg-card border border-border rounded-xl px-4 py-3 text-center">
    <div className={`text-lg font-semibold ${accent ? "text-accent" : "text-text-primary"}`}>{value}</div>
    <div className="text-[10px] text-text-tertiary uppercase tracking-wider mt-0.5">{label}</div>
  </div>
);

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
