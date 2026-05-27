import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { pickFolder } from "../../../utils/pickPath";
import { cancelSync } from "../../../utils/cancelSync";
import { Spinner } from "../../atoms/Spinner/Spinner";
import type { LibraryScanProgress } from "../../../types/library";

interface WelcomeScreenProps {
  onComplete: () => void;
}

export const WelcomeScreen = ({ onComplete }: WelcomeScreenProps) => {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number; file: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleChooseFolder = async () => {
    const selected = await pickFolder("Choose your music library folder");
    if (!selected) return;

    setScanning(true);
    setError(null);

    const unlisten = await listen<LibraryScanProgress>("library-scan-progress", (e) => {
      setProgress({ completed: e.payload.completed, total: e.payload.total, file: e.payload.current_file });
    });

    try {
      await invoke("set_library_location", { path: selected });
      onComplete();
    } catch (e) {
      const msg = String(e);
      // Cancellation is not an error — just reset to the folder picker
      if (msg.includes("Cancelled")) {
        setScanning(false);
        setProgress(null);
      } else {
        setError(`Scan failed: ${msg}`);
        setScanning(false);
      }
    } finally {
      unlisten();
    }
  };

  const pct = progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="h-screen flex items-center justify-center bg-bg-primary text-text-primary">
      <div className="flex flex-col items-center gap-8 max-w-md px-8 text-center">
        {/* Logo / Title */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-bg-card border border-border flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="w-8 h-8 text-accent"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V4.103A2.25 2.25 0 0 0 17.868 2.1l-6.397 1.828A2.25 2.25 0 0 0 9.868 6.1v7.128m0 0a2.697 2.697 0 0 0-.372-.018 1.803 1.803 0 1 0 .372.018Z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Welcome to Crate</h1>
          <p className="text-sm text-text-secondary leading-relaxed">
            Point Crate at your music folder to get started. Your files stay where they are — Crate just reads them.
          </p>
        </div>

        {/* Action area */}
        {scanning ? (
          <div className="flex flex-col items-center gap-4 w-full">
            <Spinner />
            <div className="w-full">
              <div className="flex justify-between text-[10px] text-text-tertiary mb-1.5">
                <span>Scanning library...</span>
                <span>{pct}%</span>
              </div>
              <div className="w-full h-1.5 bg-bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-[width] duration-200"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {progress?.file && <p className="text-[10px] text-text-tertiary mt-1.5 truncate">{progress.file}</p>}
            </div>
            <button
              onClick={cancelSync}
              className="text-[11px] text-text-tertiary hover:text-text-secondary transition-colors mt-2"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={handleChooseFolder}
              className="px-6 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              Choose Music Folder
            </button>
            {error && <p className="text-[11px] text-danger">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
};
