import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { matchesShortcut } from "../utils/shortcuts";

export const useAppEventListeners = ({
  onOpenSettings,
  onLibraryChanged,
  onToggleShortcuts,
  onToggleCommandPalette,
  onCheckForUpdates,
}: {
  onOpenSettings: () => void;
  onLibraryChanged: () => void;
  onToggleShortcuts: () => void;
  onToggleCommandPalette: () => void;
  onCheckForUpdates: () => void;
}) => {
  const onOpenSettingsRef = useRef(onOpenSettings);
  onOpenSettingsRef.current = onOpenSettings;
  const onLibraryChangedRef = useRef(onLibraryChanged);
  onLibraryChangedRef.current = onLibraryChanged;
  const onToggleShortcutsRef = useRef(onToggleShortcuts);
  onToggleShortcutsRef.current = onToggleShortcuts;
  const onToggleCommandPaletteRef = useRef(onToggleCommandPalette);
  onToggleCommandPaletteRef.current = onToggleCommandPalette;
  const onCheckForUpdatesRef = useRef(onCheckForUpdates);
  onCheckForUpdatesRef.current = onCheckForUpdates;

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

  // "Check for Updates" menu item
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("check-for-updates", () => onCheckForUpdatesRef.current()).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  // Global shortcuts: shortcuts dialog (default Cmd+/) and command palette (default Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't steal keystrokes from text fields (the binding may be a bare key)
      const target = e.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (matchesShortcut(e, "toggleShortcutsDialog")) {
        e.preventDefault();
        onToggleShortcutsRef.current();
      }
      if (matchesShortcut(e, "toggleCommandPalette")) {
        e.preventDefault();
        onToggleCommandPaletteRef.current();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
};
