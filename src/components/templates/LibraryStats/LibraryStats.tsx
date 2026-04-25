import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { LibraryStats as LibraryStatsData, LibStatsScanProgress } from "../../../types/libstats";
import type { Phase, StatsFilter } from "./types";
import { StatsOverview } from "./StatsOverview";
import { StatsDetailModal } from "./StatsDetailModal";
import { useProgress } from "../../../contexts/ProgressContext";

interface LibraryStatsProps {
  libraryPath: string | null;
}

export const LibraryStats = ({ libraryPath }: LibraryStatsProps) => {
  const { start: startProgress, update: updateProgress, finish: finishProgress, fail: failProgress } = useProgress();

  const [phase, setPhase] = useState<Phase>("idle");
  const [stats, setStats] = useState<LibraryStatsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<StatsFilter | null>(null);
  const scannedPathRef = useRef<string | null>(null);

  // Listen for scan progress
  useEffect(() => {
    let active = true;
    const unsubs: UnlistenFn[] = [];

    listen<LibStatsScanProgress>("libstats-scan-progress", (e) => {
      if (active) {
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

  const cancelScan = async () => {
    try {
      await invoke("cancel_sync");
    } catch (_) {}
  };

  const scanLibrary = async (path: string) => {
    setPhase("scanning");
    setError(null);
    startProgress("Scanning library stats...", cancelScan);
    try {
      const data = await invoke<LibraryStatsData>("scan_library_stats", { path });
      setStats(data);
      setPhase("scanned");
      scannedPathRef.current = path;
      finishProgress(`Scanned ${data.total_tracks} tracks`);
    } catch (e) {
      const msg = `${e}`;
      if (msg.includes("Cancelled")) {
        setPhase("idle");
        finishProgress("Scan cancelled");
      } else {
        setError(msg);
        setPhase("idle");
        failProgress(msg);
      }
    }
  };

  // Auto-scan when libraryPath is provided and we haven't scanned it yet
  useEffect(() => {
    if (libraryPath && libraryPath !== scannedPathRef.current && phase !== "scanning") {
      scanLibrary(libraryPath);
    }
  }, [libraryPath]);

  if (!libraryPath) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-text-tertiary text-xs text-center">Set a library location in Settings to view stats.</p>
      </div>
    );
  }

  if (phase === "idle" && !stats) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        {error ? (
          <div className="text-center">
            <p className="text-danger text-xs mb-3">{error}</p>
            <button
              onClick={() => scanLibrary(libraryPath)}
              className="px-3 py-1.5 bg-bg-card border border-border text-text-secondary rounded-lg text-[11px] font-medium hover:text-text-primary hover:border-border-active transition-all"
            >
              Retry
            </button>
          </div>
        ) : (
          <p className="text-text-tertiary text-xs">Loading stats...</p>
        )}
      </div>
    );
  }

  if (phase === "scanning") {
    return <div className="flex-1" />;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Rescan button */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest">Library Stats</span>
        <div className="flex-1" />
        <button
          onClick={() => scanLibrary(libraryPath)}
          className="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors"
        >
          Rescan
        </button>
      </div>

      {stats && <StatsOverview stats={stats} onFilterSelect={setActiveFilter} />}

      {activeFilter && stats && (
        <StatsDetailModal filter={activeFilter} files={stats.file_details} onClose={() => setActiveFilter(null)} />
      )}
    </div>
  );
};
