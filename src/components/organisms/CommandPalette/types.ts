import type { ToolTab } from "../ToolsSidebar/types";

export type TopTabId = "library" | "tools" | "discover" | "inbox";

/** A single palette entry: static metadata plus the callback it triggers. */
export interface CommandAction {
  id: string;
  title: string;
  keywords: string;
  group: string;
  run: () => void;
}

export interface CommandGroup {
  group: string;
  actions: CommandAction[];
}

/** Everything `buildActions` needs to wire actions to app state. */
export interface CommandDeps {
  selectTab: (tab: TopTabId) => void;
  selectTool: (tool: ToolTab) => void;
  openSettings: () => void;
  rescanLibrary: () => void;
  toggleColumnBrowser: () => void;
  toggleAlbumGrid: () => void;
  toggleArtworkCarousel: () => void;
  togglePlayPause: () => void;
  nextTrack: () => void;
  previousTrack: () => void;
  discoverEnabled: boolean;
}

export interface CommandPaletteProps {
  onClose: () => void;
  onSelectTab: (tab: TopTabId) => void;
  onSelectTool: (tool: ToolTab) => void;
  onOpenSettings: () => void;
  onRescan: () => void;
  discoverEnabled: boolean;
}
