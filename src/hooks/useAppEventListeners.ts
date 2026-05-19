import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

export const useAppEventListeners = ({
  onOpenSettings,
  onLibraryChanged,
  onToggleShortcuts,
}: {
  onOpenSettings: () => void;
  onLibraryChanged: () => void;
  onToggleShortcuts: () => void;
}) => {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("open-settings", () => onOpenSettings()).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [onOpenSettings]);

  // Auto-refresh library when filesystem watcher detects changes
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("library-changed", () => onLibraryChanged()).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [onLibraryChanged]);

  // Global Cmd+/ to open keyboard shortcuts dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        onToggleShortcuts();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onToggleShortcuts]);
};
