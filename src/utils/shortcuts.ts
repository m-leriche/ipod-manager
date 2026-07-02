/**
 * Central keyboard shortcut registry.
 *
 * Default bindings live here; user overrides are persisted via the
 * `shortcutOverrides` setting. Handlers call `matchesShortcut` at event
 * time so rebinding takes effect immediately without re-registering.
 */

import { getSetting, setSetting } from "./settings";
import type { ShortcutAction, ShortcutBinding } from "../types/shortcuts";

export interface ShortcutDef {
  action: ShortcutAction;
  label: string;
  category: "Playback" | "Navigation" | "Library" | "General";
}

export const SHORTCUT_DEFS: ShortcutDef[] = [
  { action: "playPause", label: "Play / Pause", category: "Playback" },
  { action: "seekBackward", label: "Seek backward 10s", category: "Playback" },
  { action: "seekForward", label: "Seek forward 10s", category: "Playback" },
  { action: "previousTrack", label: "Previous track", category: "Playback" },
  { action: "nextTrack", label: "Next track", category: "Playback" },
  { action: "switchTabLibrary", label: "Go to Library", category: "Navigation" },
  { action: "switchTabTools", label: "Go to Tools", category: "Navigation" },
  { action: "switchTabDiscover", label: "Go to Discover", category: "Navigation" },
  { action: "switchTabInbox", label: "Go to Inbox", category: "Navigation" },
  { action: "focusSearch", label: "Search library", category: "Library" },
  { action: "viewColumnBrowser", label: "Column browser view", category: "Library" },
  { action: "viewAlbumGrid", label: "Album grid view", category: "Library" },
  { action: "viewArtworkCarousel", label: "Artwork carousel view", category: "Library" },
  { action: "rateTracks1", label: "Rate selection 1 star", category: "Library" },
  { action: "rateTracks2", label: "Rate selection 2 stars", category: "Library" },
  { action: "rateTracks3", label: "Rate selection 3 stars", category: "Library" },
  { action: "rateTracks4", label: "Rate selection 4 stars", category: "Library" },
  { action: "rateTracks5", label: "Rate selection 5 stars", category: "Library" },
  { action: "clearRating", label: "Clear rating on selection", category: "Library" },
  { action: "toggleFlagTracks", label: "Toggle sync flag on selection", category: "Library" },
  { action: "toggleShortcutsDialog", label: "Show shortcuts dialog", category: "General" },
  { action: "toggleQueuePanel", label: "Toggle queue panel", category: "General" },
];

/** Rating actions in star order — index + 1 is the star value. */
export const RATING_ACTIONS = ["rateTracks1", "rateTracks2", "rateTracks3", "rateTracks4", "rateTracks5"] as const;

/** Actions that operate on the current track selection (bare keys by default). */
export const SELECTION_SHORTCUT_ACTIONS: ShortcutAction[] = [...RATING_ACTIONS, "clearRating", "toggleFlagTracks"];

const binding = (code: string, opts: Partial<Omit<ShortcutBinding, "code">> = {}): ShortcutBinding => ({
  code,
  mod: opts.mod ?? false,
  shift: opts.shift ?? false,
  alt: opts.alt ?? false,
});

export const DEFAULT_BINDINGS: Record<ShortcutAction, ShortcutBinding> = {
  playPause: binding("Space"),
  seekBackward: binding("ArrowLeft"),
  seekForward: binding("ArrowRight"),
  previousTrack: binding("ArrowLeft", { mod: true }),
  nextTrack: binding("ArrowRight", { mod: true }),
  focusSearch: binding("KeyF", { mod: true }),
  toggleShortcutsDialog: binding("Slash", { mod: true }),
  switchTabLibrary: binding("Digit1", { mod: true }),
  switchTabTools: binding("Digit2", { mod: true }),
  switchTabDiscover: binding("Digit3", { mod: true }),
  switchTabInbox: binding("Digit4", { mod: true }),
  viewColumnBrowser: binding("Digit1", { alt: true }),
  viewAlbumGrid: binding("Digit2", { alt: true }),
  viewArtworkCarousel: binding("Digit3", { alt: true }),
  rateTracks1: binding("Digit1"),
  rateTracks2: binding("Digit2"),
  rateTracks3: binding("Digit3"),
  rateTracks4: binding("Digit4"),
  rateTracks5: binding("Digit5"),
  clearRating: binding("Digit0"),
  toggleFlagTracks: binding("KeyL"),
  toggleQueuePanel: binding("KeyQ", { alt: true }),
};

export const getBinding = (action: ShortcutAction): ShortcutBinding =>
  getSetting("shortcutOverrides")[action] ?? DEFAULT_BINDINGS[action];

export const setBindingOverride = (action: ShortcutAction, override: ShortcutBinding | null) => {
  const overrides = { ...getSetting("shortcutOverrides") };
  if (override === null) {
    delete overrides[action];
  } else {
    overrides[action] = override;
  }
  setSetting("shortcutOverrides", overrides);
};

export const resetAllBindings = () => setSetting("shortcutOverrides", {});

export const bindingsEqual = (a: ShortcutBinding, b: ShortcutBinding): boolean =>
  a.code === b.code && a.mod === b.mod && a.shift === b.shift && a.alt === b.alt;

/** Exact-match a keyboard event against an action's current binding. */
export const matchesShortcut = (e: KeyboardEvent, action: ShortcutAction): boolean => {
  const b = getBinding(action);
  return e.code === b.code && (e.metaKey || e.ctrlKey) === b.mod && e.shiftKey === b.shift && e.altKey === b.alt;
};

/** True when the event originates from a text-entry element (input, textarea,
    contenteditable) — shortcuts must not steal keystrokes from typing. */
export const isTextEntryTarget = (e: KeyboardEvent): boolean => {
  const target = e.target as HTMLElement | null;
  if (!target) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable === true;
};

// Fixed combos handled outside the registry (in-app handlers and macOS conventions)
// that a recorded binding must not shadow.
const RESERVED_BINDINGS: { binding: ShortcutBinding; label: string }[] = [
  { binding: binding("KeyZ", { mod: true }), label: "Undo" },
  { binding: binding("Comma", { mod: true }), label: "Settings" },
  { binding: binding("KeyA", { mod: true }), label: "Select All" },
  { binding: binding("KeyC", { mod: true }), label: "Copy" },
  { binding: binding("KeyX", { mod: true }), label: "Cut" },
  { binding: binding("KeyV", { mod: true }), label: "Paste" },
  { binding: binding("KeyQ", { mod: true }), label: "Quit" },
  { binding: binding("KeyW", { mod: true }), label: "Close Window" },
];

/** Label of the action or fixed combo already using `candidate`, if any. */
export const findConflict = (candidate: ShortcutBinding, exclude: ShortcutAction): string | null => {
  for (const def of SHORTCUT_DEFS) {
    if (def.action !== exclude && bindingsEqual(getBinding(def.action), candidate)) return def.label;
  }
  const reserved = RESERVED_BINDINGS.find((r) => bindingsEqual(r.binding, candidate));
  return reserved ? reserved.label : null;
};

const MODIFIER_CODES = new Set([
  "MetaLeft",
  "MetaRight",
  "ControlLeft",
  "ControlRight",
  "ShiftLeft",
  "ShiftRight",
  "AltLeft",
  "AltRight",
  "CapsLock",
]);

/** Convert a keydown event to a binding for recording. Null for bare modifiers. */
export const eventToBinding = (e: KeyboardEvent): ShortcutBinding | null => {
  if (MODIFIER_CODES.has(e.code) || e.code === "") return null;
  return {
    code: e.code,
    mod: e.metaKey || e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
  };
};

const isMac = navigator.platform.toUpperCase().includes("MAC");
const MOD_LABEL = isMac ? "⌘" : "Ctrl";

const CODE_LABELS: Record<string, string> = {
  Space: "Space",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Slash: "/",
  Backslash: "\\",
  Comma: ",",
  Period: ".",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  BracketLeft: "[",
  BracketRight: "]",
  Minus: "-",
  Equal: "=",
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "⌫",
  Delete: "Del",
  Escape: "Esc",
  Home: "Home",
  End: "End",
  PageUp: "PgUp",
  PageDown: "PgDn",
};

const keyLabel = (code: string): string => {
  if (CODE_LABELS[code]) return CODE_LABELS[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  return code;
};

/** Display parts for a binding, e.g. ["⌘", "F"] or ["Shift", "→"]. */
export const formatBinding = (b: ShortcutBinding): string[] => {
  const parts: string[] = [];
  if (b.mod) parts.push(MOD_LABEL);
  if (b.alt) parts.push(isMac ? "⌥" : "Alt");
  if (b.shift) parts.push(isMac ? "⇧" : "Shift");
  parts.push(keyLabel(b.code));
  return parts;
};
