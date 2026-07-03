import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { isTextEntryTarget, matchesShortcut } from "../utils/shortcuts";
import type { ShortcutAction } from "../types/shortcuts";

type TopTab = "library" | "tools" | "discover" | "inbox";

const TAB_ACTIONS: { action: ShortcutAction; tab: TopTab }[] = [
  { action: "switchTabLibrary", tab: "library" },
  { action: "switchTabTools", tab: "tools" },
  { action: "switchTabDiscover", tab: "discover" },
  { action: "switchTabInbox", tab: "inbox" },
];

export const useAppEventListeners = ({
  onOpenSettings,
  onLibraryChanged,
  onToggleShortcuts,
  onToggleCommandPalette,
  onCheckForUpdates,
  onSwitchTab,
  onToggleQueue,
}: {
  onOpenSettings: () => void;
  onLibraryChanged: () => void;
  onToggleShortcuts: () => void;
  onToggleCommandPalette: () => void;
  onCheckForUpdates: () => void;
  onSwitchTab: (tab: TopTab) => void;
  onToggleQueue: () => void;
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
  const onSwitchTabRef = useRef(onSwitchTab);
  onSwitchTabRef.current = onSwitchTab;
  const onToggleQueueRef = useRef(onToggleQueue);
  onToggleQueueRef.current = onToggleQueue;

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

  // Global shortcuts: shortcuts dialog (default Cmd+/), queue panel, tab switching, command palette (default Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't steal keystrokes from text fields (the binding may be a bare key)
      if (isTextEntryTarget(e)) return;
      if (matchesShortcut(e, "toggleShortcutsDialog")) {
        e.preventDefault();
        onToggleShortcutsRef.current();
        return;
      }
      if (matchesShortcut(e, "toggleQueuePanel")) {
        e.preventDefault();
        onToggleQueueRef.current();
        return;
      }
      const tabAction = TAB_ACTIONS.find(({ action }) => matchesShortcut(e, action));
      if (tabAction) {
        e.preventDefault();
        onSwitchTabRef.current(tabAction.tab);
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
