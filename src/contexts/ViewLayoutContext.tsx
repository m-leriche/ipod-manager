import { createContext, useContext } from "react";

export interface ViewLayoutState {
  showColumnBrowser: boolean;
  showInfoPanel: boolean;
  showStatsPanel: boolean;
  showPlaylistSidebar: boolean;
  showAlbumGrid: boolean;
  showTrackList: boolean;
  showLyricsPanel: boolean;
  showArtworkCarousel: boolean;
  lyricsOverlay: boolean;
  toggleColumnBrowser: () => void;
  toggleInfoPanel: () => void;
  toggleStatsPanel: () => void;
  togglePlaylistSidebar: () => void;
  toggleAlbumGrid: () => void;
  toggleTrackList: () => void;
  toggleArtworkCarousel: () => void;
  toggleLyricsPanel: () => void;
  toggleLyricsOverlay: () => void;
  dismissLyricsOverlay: () => void;
}

const ViewLayoutContext = createContext<ViewLayoutState | null>(null);

export const ViewLayoutProvider = ViewLayoutContext.Provider;

export const useViewLayout = (): ViewLayoutState => {
  const ctx = useContext(ViewLayoutContext);
  if (!ctx) throw new Error("useViewLayout must be used within ViewLayoutProvider");
  return ctx;
};
