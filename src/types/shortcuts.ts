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
  | "toggleShortcutsDialog"
  | "switchTabLibrary"
  | "switchTabTools"
  | "switchTabDiscover"
  | "switchTabInbox"
  | "viewColumnBrowser"
  | "viewAlbumGrid"
  | "viewArtworkCarousel"
  | "rateTracks1"
  | "rateTracks2"
  | "rateTracks3"
  | "rateTracks4"
  | "rateTracks5"
  | "clearRating"
  | "toggleFlagTracks"
  | "toggleQueuePanel";
