import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { useProgress } from "../../../contexts/ProgressContext";
import type { LibraryFolder, LibraryScanProgress } from "../../../types/library";
import type { SettingsModalProps } from "./types";

export const SettingsModal = ({ onClose, onLibraryChanged }: SettingsModalProps) => {
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const { start: startProgress, update: updateProgress, finish: finishProgress, fail: failProgress } = useProgress();

  const fetchFolders = useCallback(async () => {
    try {
      const result = await invoke<LibraryFolder[]>("get_library_folders");
      setFolders(result);
    } catch {
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleAddFolder = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (!selected) return;

    startProgress("Scanning library...", () => invoke("cancel_sync"));

    const unlisten = await listen<LibraryScanProgress>("library-scan-progress", (e) => {
      updateProgress(e.payload.completed, e.payload.total, e.payload.current_file);
    });

    try {
      await invoke("add_library_folder", { path: selected });
      finishProgress("Library scan complete");
      await fetchFolders();
      onLibraryChanged();
    } catch (e) {
      failProgress(`Scan failed: ${e}`);
    } finally {
      unlisten();
    }
  }, [startProgress, updateProgress, finishProgress, failProgress, fetchFolders, onLibraryChanged]);

  const handleRemoveFolder = useCallback(
    async (path: string) => {
      try {
        await invoke("remove_library_folder", { path });
        await fetchFolders();
        onLibraryChanged();
      } catch {
        // Silently fail — folder may have already been removed
      }
    },
    [fetchFolders, onLibraryChanged],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} data-testid="settings-backdrop" />
      <div className="relative bg-bg-secondary border border-border rounded-2xl shadow-xl w-[520px] max-w-[95vw] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-sm font-medium text-text-primary">Settings</h2>
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
            <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest block mb-3">
              Library Folders
            </span>

            {loading ? (
              <div className="text-xs text-text-tertiary py-4 text-center">Loading...</div>
            ) : folders.length === 0 ? (
              <div className="text-xs text-text-tertiary py-6 text-center">
                No folders added yet. Add a music folder to get started.
              </div>
            ) : (
              <div className="border border-border rounded-xl overflow-hidden mb-3">
                {folders.map((folder, i) => (
                  <div
                    key={folder.id}
                    className={`flex items-center gap-3 px-4 py-3 ${i < folders.length - 1 ? "border-b border-border-subtle" : ""}`}
                  >
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
                    <span className="text-xs text-text-secondary truncate flex-1 min-w-0">{folder.path}</span>
                    <button
                      onClick={() => handleRemoveFolder(folder.path)}
                      className="text-[11px] text-text-tertiary hover:text-red-400 transition-colors shrink-0"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleAddFolder}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium text-text-tertiary hover:text-text-secondary border border-border hover:border-border-active transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Folder
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
