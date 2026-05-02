import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useProgress } from "../../../contexts/ProgressContext";
import { cancelSync } from "../../../utils/cancelSync";
import { pickFolder } from "../../../utils/pickPath";
import { useTheme } from "../../../contexts/ThemeContext";
import type { ThemeName } from "../../../contexts/ThemeContext";
import { RetroWindowDots } from "../../atoms/RetroWindowDots/RetroWindowDots";
import type { LibraryScanProgress } from "../../../types/library";
import type { SettingsModalProps } from "./types";

const THEMES: { id: ThemeName; label: string; description: string; preview: [string, string, string] }[] = [
  { id: "dark", label: "Dark", description: "Minimal dark theme", preview: ["#000000", "#111111", "#0066FF"] },
  {
    id: "win95",
    label: "Windows 95",
    description: "Classic Win95 desktop",
    preview: ["#C0C0C0", "#000080", "#FFFFFF"],
  },
  { id: "classic", label: "Classic", description: "Vintage Mac + iPod", preview: ["#F2F0ED", "#D9D7D4", "#000000"] },
  { id: "winamp", label: "Winamp", description: "Classic media player", preview: ["#232323", "#2A2A2A", "#00FF00"] },
  { id: "gameboy", label: "Game Boy", description: "Handheld LCD", preview: ["#C0BAA7", "#9AA86A", "#3B3073"] },
  { id: "aqua", label: "Aqua", description: "Mac OS X era", preview: ["#E8E8E8", "#C8C8C8", "#3498DB"] },
  { id: "msdos", label: "MS-DOS", description: "Command prompt", preview: ["#000000", "#000000", "#AAAAAA"] },
  { id: "terminal", label: "Terminal", description: "Amber phosphor CRT", preview: ["#080500", "#060300", "#FFB830"] },
];

export const SettingsModal = ({ onClose, onLibraryChanged }: SettingsModalProps) => {
  const [libraryLocation, setLibraryLocation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { start: startProgress, update: updateProgress, finish: finishProgress, fail: failProgress } = useProgress();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    invoke<string | null>("get_library_location")
      .then(setLibraryLocation)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSetLibraryLocation = useCallback(async () => {
    const selected = await pickFolder("Choose library location");
    if (!selected) return;

    startProgress("Scanning library...", cancelSync);

    const unlisten = await listen<LibraryScanProgress>("library-scan-progress", (e) => {
      updateProgress(e.payload.completed, e.payload.total, e.payload.current_file);
    });

    try {
      await invoke("set_library_location", { path: selected });
      setLibraryLocation(selected);
      finishProgress("Library scan complete");
      onLibraryChanged();
    } catch (e) {
      failProgress(`Scan failed: ${e}`);
    } finally {
      unlisten();
    }
  }, [startProgress, updateProgress, finishProgress, failProgress, onLibraryChanged]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} data-testid="settings-backdrop" />
      <div className="relative bg-bg-secondary border border-border rounded-2xl shadow-xl w-[520px] max-w-[95vw] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="retro-titlebar flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <RetroWindowDots />
            <h2 className="text-sm font-medium text-text-primary">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          <div>
            <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest block mb-1">
              Library Location
            </span>
            <p className="text-[10px] text-text-tertiary mb-3">
              Your music library folder. Files are organized here as Artist / Album.
            </p>

            {loading ? (
              <div className="text-xs text-text-tertiary py-4 text-center">Loading...</div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 border border-border rounded-xl">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className="w-4 h-4 text-text-tertiary shrink-0"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.06-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
                  />
                </svg>
                <span className="text-xs text-text-secondary truncate flex-1 min-w-0">
                  {libraryLocation ?? "Not configured"}
                </span>
                <button
                  onClick={handleSetLibraryLocation}
                  className="text-[11px] text-accent hover:text-accent-hover transition-colors shrink-0"
                >
                  {libraryLocation ? "Change" : "Choose"}
                </button>
              </div>
            )}
          </div>

          {/* Theme */}
          <div className="mt-6">
            <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest block mb-1">
              Theme
            </span>
            <p className="text-[10px] text-text-tertiary mb-3">Choose how Crate looks.</p>

            <div className="grid grid-cols-4 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`flex flex-col items-center gap-1.5 px-3 py-2.5 border rounded-xl transition-all ${
                    theme === t.id ? "border-accent bg-bg-hover" : "border-border hover:border-border-active"
                  }`}
                >
                  <div className="flex gap-1">
                    {t.preview.map((color, i) => (
                      <div
                        key={i}
                        className="w-4 h-4 rounded-sm border border-black/10"
                        style={{ background: color }}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] font-medium text-text-primary">{t.label}</span>
                  <span className="text-[9px] text-text-tertiary">{t.description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
