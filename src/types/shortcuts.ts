/** A single keyboard binding. `code` is KeyboardEvent.code (layout-independent). */
export interface ShortcutBinding {
  code: string;
  /** Cmd on macOS / Ctrl elsewhere. */
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

/** Actions whose bindings can be customized in Settings → Shortcuts. */
export type ShortcutAction =
  | "playPause"
  | "seekBackward"
  | "seekForward"
  | "previousTrack"
  | "nextTrack"
  | "focusSearch"
  | "toggleShortcutsDialog";
