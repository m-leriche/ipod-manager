import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type { LibraryStats as LibraryStatsData, LibStatsScanProgress, RockboxPlayData } from "../../../types/libstats";
import type { Phase, StatsMode, StatsFilter } from "./types";
import { Spinner } from "../../atoms/Spinner/Spinner";
import { StatsOverview } from "./StatsOverview";
import { StatsDetailModal } from "./StatsDetailModal";
import { PlayDataView } from "./PlayDataView";
import { useProgress } from "../../../contexts/ProgressContext";

const DEFAULT_IPOD_PATH = "/Volumes/IPOD";

export const LibraryStats = () => {
  const { start: startProgress, update: updateProgress, finish: finishProgress, fail: failProgress } = useProgress();
  const [mode, setMode] = useState<StatsMode>("library");

  // Library stats state
  const [phase, setPhase] = useState<Phase>("idle");
  const [scanPath, setScanPath] = useState("");
  const [stats, setStats] = useState<LibraryStatsData | null>(null);
  const [scanProgress, setScanProgress] = useState<LibStatsScanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<StatsFilter | null>(null);

  // Rockbox play data state
  const [playData, setPlayData] = useState<RockboxPlayData | null>(null);
  const [playDataLoading, setPlayDataLoading] = useState(false);
  const [playDataError, setPlayDataError] = useState<string | null>(null);
  const [ipodPath, setIpodPath] = useState("");

  // Listen for scan progress
  useEffect(() => {
    let active = true;
    const unsubs: UnlistenFn[] = [];

    listen<LibStatsScanProgress>("libstats-scan-progress", (e) => {
      if (active) {
        setScanProgress(e.payload);
        updateProgress(e.payload.completed, e.payload.total, e.payload.current_file);
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

  const browseLibrary = async () => {
    const picked = await open({ directory: true, multiple: false });
    if (picked) {
      setScanPath(picked as string);
      await scanLibrary(picked as string);
    }
  };

  const scanLibrary = async (path: string) => {
    setPhase("scanning");
    setError(null);
    setScanProgress(null);
    startProgress("Scanning library stats...");
    try {
      const data = await invoke<LibraryStatsData>("scan_library_stats", { path });
      setStats(data);
      setPhase("scanned");
      finishProgress(`Scanned ${data.total_tracks} tracks`);
    } catch (e) {
      setError(`${e}`);
      setPhase("idle");
      failProgress(`${e}`);
    }
  };

  const loadPlayData = async (path: string) => {
    setPlayDataLoading(true);
    setPlayDataError(null);
    try {
      const data = await invoke<RockboxPlayData>("read_rockbox_playdata", { ipodPath: path });
      setPlayData(data);
    } catch (e) {
      setPlayDataError(`${e}`);
    } finally {
      setPlayDataLoading(false);
    }
  };

  const browseIpod = async () => {
    const picked = await open({ directory: true, multiple: false });
    if (picked) {
      setIpodPath(picked as string);
      await loadPlayData(picked as string);
    }
  };

  const tryDefaultIpod = async () => {
    setIpodPath(DEFAULT_IPOD_PATH);
    await loadPlayData(DEFAULT_IPOD_PATH);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-3">
      {/* Mode toggle */}
      <div className="flex gap-1.5 shrink-0">
        <ModeButton active={mode === "library"} onClick={() => setMode("library")}>
          Library Stats
        </ModeButton>
        <ModeButton active={mode === "rockbox"} onClick={() => setMode("rockbox")}>
          iPod Play Data
        </ModeButton>
      </div>

      {mode === "library" && (
        <LibraryMode
          phase={phase}
          scanPath={scanPath}
          stats={stats}
          scanProgress={scanProgress}
          error={error}
          onBrowse={browseLibrary}
          onRescan={() => scanLibrary(scanPath)}
          onFilterSelect={setActiveFilter}
        />
      )}

      {activeFilter && stats && (
        <StatsDetailModal filter={activeFilter} files={stats.file_details} onClose={() => setActiveFilter(null)} />
      )}

      {mode === "rockbox" && (
        <RockboxMode
          playData={playData}
          loading={playDataLoading}
          error={playDataError}
          ipodPath={ipodPath}
          onBrowse={browseIpod}
          onTryDefault={tryDefaultIpod}
        />
      )}
    </div>
  );
};

// ── Sub-views ───────────────────────────────────────────────────

const LibraryMode = ({
  phase,
  scanPath,
  stats,
  scanProgress,
  error,
  onBrowse,
  onRescan,
  onFilterSelect,
}: {
  phase: Phase;
  scanPath: string;
  stats: LibraryStatsData | null;
  scanProgress: LibStatsScanProgress | null;
  error: string | null;
  onBrowse: () => void;
  onRescan: () => void;
  onFilterSelect: (filter: StatsFilter) => void;
}) => {
  if (phase === "idle") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <p className="text-text-tertiary text-xs mb-4">
            Scan a music library to see format breakdown, genre distribution, and more.
          </p>
          {error && <p className="text-danger text-xs mb-3">{error}</p>}
          <button
            onClick={onBrowse}
            className="px-5 py-2.5 bg-text-primary text-bg-primary rounded-xl text-xs font-medium hover:opacity-90 transition-opacity"
          >
            Choose Folder
          </button>
        </div>
      </div>
    );
  }

  if (phase === "scanning") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-text-tertiary text-xs mb-2">
            <Spinner /> Scanning library...
          </div>
          {scanProgress && (
            <>
              <div className="w-48 h-1.5 bg-bg-card rounded-full overflow-hidden mb-2 mx-auto">
                <div
                  className="h-full bg-text-primary rounded-full transition-all duration-200"
                  style={{ width: `${(scanProgress.completed / scanProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-text-secondary font-medium">
                {scanProgress.completed.toLocaleString()} of {scanProgress.total.toLocaleString()} files
              </p>
              <p className="text-[10px] text-text-tertiary mt-1 max-w-xs truncate mx-auto">
                {scanProgress.current_file}
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3 bg-bg-secondary border border-border rounded-2xl px-5 py-3 shrink-0">
        <span className="text-xs text-text-secondary font-medium truncate flex-1 min-w-0">{scanPath}</span>
        <button
          onClick={onRescan}
          className="px-3 py-1.5 bg-bg-card border border-border text-text-tertiary rounded-lg text-[11px] font-medium shrink-0 hover:text-text-secondary hover:border-border-active transition-all"
        >
          Rescan
        </button>
        <button
          onClick={onBrowse}
          className="px-3 py-1.5 bg-bg-card border border-border text-text-tertiary rounded-lg text-[11px] font-medium shrink-0 hover:text-text-secondary hover:border-border-active transition-all"
        >
          Browse
        </button>
      </div>
      {stats && <StatsOverview stats={stats} onFilterSelect={onFilterSelect} />}
    </>
  );
};

const RockboxMode = ({
  playData,
  loading,
  error,
  ipodPath,
  onBrowse,
  onTryDefault,
}: {
  playData: RockboxPlayData | null;
  loading: boolean;
  error: string | null;
  ipodPath: string;
  onBrowse: () => void;
  onTryDefault: () => void;
}) => {
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-text-tertiary text-xs">
          <Spinner /> Reading Rockbox database...
        </div>
      </div>
    );
  }

  if (!playData) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-text-tertiary text-xs mb-1">
            Read play counts, ratings, and listening history from your Rockbox iPod.
          </p>
          <p className="text-text-tertiary text-[11px] mb-4">
            Your iPod must be mounted with an initialized Rockbox database.
          </p>
          {error && <p className="text-danger text-xs mb-3">{error}</p>}
          <div className="flex gap-2 justify-center">
            <button
              onClick={onTryDefault}
              className="px-5 py-2.5 bg-text-primary text-bg-primary rounded-xl text-xs font-medium hover:opacity-90 transition-opacity"
            >
              Detect iPod
            </button>
            <button
              onClick={onBrowse}
              className="px-4 py-2.5 bg-bg-card border border-border text-text-secondary rounded-xl text-xs font-medium hover:border-border-active transition-all"
            >
              Browse...
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {ipodPath && (
        <div className="flex items-center gap-3 bg-bg-secondary border border-border rounded-2xl px-5 py-3 shrink-0">
          <span className="text-xs text-text-secondary font-medium truncate flex-1 min-w-0">{ipodPath}</span>
          <button
            onClick={onBrowse}
            className="px-3 py-1.5 bg-bg-card border border-border text-text-tertiary rounded-lg text-[11px] font-medium shrink-0 hover:text-text-secondary hover:border-border-active transition-all"
          >
            Browse
          </button>
        </div>
      )}
      <PlayDataView playData={playData} />
    </>
  );
};

const ModeButton = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
      active
        ? "bg-bg-card text-text-primary border border-border-active"
        : "text-text-tertiary border border-transparent hover:text-text-secondary"
    }`}
  >
    {children}
  </button>
);
