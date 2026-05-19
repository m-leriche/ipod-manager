import { useEffect, useRef } from "react";
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
  const onOpenSettingsRef = useRef(onOpenSettings);
  onOpenSettingsRef.current = onOpenSettings;
  const onLibraryChangedRef = useRef(onLibraryChanged);
  onLibraryChangedRef.current = onLibraryChanged;
  const onToggleShortcutsRef = useRef(onToggleShortcuts);
  onToggleShortcutsRef.current = onToggleShortcuts;

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("open-settings", () => onOpenSettingsRef.current()).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  // Auto-refresh library when filesystem watcher detects changes
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("library-changed", () => onLibraryChangedRef.current()).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  // Global Cmd+/ to open keyboard shortcuts dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        onToggleShortcutsRef.current();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
};
