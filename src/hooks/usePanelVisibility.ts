import { useState, useCallback } from "react";

// localStorage keys
const COLUMN_BROWSER_KEY = "crate-show-column-browser";
const INFO_PANEL_KEY = "crate-show-info-panel";
const STATS_PANEL_KEY = "crate-show-stats-panel";
const PLAYLIST_SIDEBAR_KEY = "crate-show-playlist-sidebar";
const ALBUM_GRID_KEY = "crate-show-album-grid";
const TRACK_LIST_KEY = "crate-show-track-list";
const LYRICS_PANEL_KEY = "crate-show-lyrics-panel";
const ARTWORK_CAROUSEL_KEY = "crate-show-artwork-carousel";
const LYRICS_OVERLAY_KEY = "crate-lyrics-overlay";
const FULLSCREEN_VISUALIZER_KEY = "crate-show-fullscreen-visualizer";

export const usePanelVisibility = () => {
  const [showColumnBrowser, setShowColumnBrowser] = useState(
    () => localStorage.getItem(COLUMN_BROWSER_KEY) !== "false",
  );
  const [showInfoPanel, setShowInfoPanel] = useState(() => localStorage.getItem(INFO_PANEL_KEY) !== "false");
  const [showStatsPanel, setShowStatsPanel] = useState(() => localStorage.getItem(STATS_PANEL_KEY) === "true");
  const [showPlaylistSidebar, setShowPlaylistSidebar] = useState(
    () => localStorage.getItem(PLAYLIST_SIDEBAR_KEY) !== "false",
  );
  const [showAlbumGrid, setShowAlbumGrid] = useState(() => localStorage.getItem(ALBUM_GRID_KEY) === "true");
  const [showTrackList, setShowTrackList] = useState(() => localStorage.getItem(TRACK_LIST_KEY) !== "false");
  const [showLyricsPanel, setShowLyricsPanel] = useState(() => localStorage.getItem(LYRICS_PANEL_KEY) === "true");
  const [showArtworkCarousel, setShowArtworkCarousel] = useState(
    () => localStorage.getItem(ARTWORK_CAROUSEL_KEY) === "true",
  );
  const [lyricsOverlay, setLyricsOverlay] = useState(() => localStorage.getItem(LYRICS_OVERLAY_KEY) === "true");
  const [showFullscreenVisualizer, setShowFullscreenVisualizer] = useState(
    () => localStorage.getItem(FULLSCREEN_VISUALIZER_KEY) === "true",
  );

  const toggleColumnBrowser = useCallback(() => {
    // If another browser mode is active, switch to column browser
    if (showAlbumGrid || showArtworkCarousel) {
      setShowAlbumGrid(false);
      localStorage.setItem(ALBUM_GRID_KEY, "false");
      setShowArtworkCarousel(false);
      localStorage.setItem(ARTWORK_CAROUSEL_KEY, "false");
      setShowColumnBrowser(true);
      localStorage.setItem(COLUMN_BROWSER_KEY, "true");
      return;
    }
    setShowColumnBrowser((prev) => {
      localStorage.setItem(COLUMN_BROWSER_KEY, String(!prev));
      return !prev;
    });
  }, [showAlbumGrid, showArtworkCarousel]);

  const toggleInfoPanel = useCallback(() => {
    setShowInfoPanel((prev) => {
      localStorage.setItem(INFO_PANEL_KEY, String(!prev));
      return !prev;
    });
  }, []);

  const toggleStatsPanel = useCallback(() => {
    setShowStatsPanel((prev) => {
      localStorage.setItem(STATS_PANEL_KEY, String(!prev));
      return !prev;
    });
  }, []);

  const togglePlaylistSidebar = useCallback(() => {
    setShowPlaylistSidebar((prev) => {
      localStorage.setItem(PLAYLIST_SIDEBAR_KEY, String(!prev));
      return !prev;
    });
  }, []);

  const toggleAlbumGrid = useCallback(() => {
    setShowAlbumGrid((prev) => {
      const next = !prev;
      localStorage.setItem(ALBUM_GRID_KEY, String(next));
      if (next) {
        setShowColumnBrowser(false);
        localStorage.setItem(COLUMN_BROWSER_KEY, "false");
        setShowArtworkCarousel(false);
        localStorage.setItem(ARTWORK_CAROUSEL_KEY, "false");
      } else {
        setShowColumnBrowser(true);
        localStorage.setItem(COLUMN_BROWSER_KEY, "true");
      }
      return next;
    });
  }, []);

  const toggleTrackList = useCallback(() => {
    setShowTrackList((prev) => {
      localStorage.setItem(TRACK_LIST_KEY, String(!prev));
      return !prev;
    });
  }, []);

  const toggleArtworkCarousel = useCallback(() => {
    setShowArtworkCarousel((prev) => {
      const next = !prev;
      localStorage.setItem(ARTWORK_CAROUSEL_KEY, String(next));
      if (next) {
        setShowColumnBrowser(false);
        localStorage.setItem(COLUMN_BROWSER_KEY, "false");
        setShowAlbumGrid(false);
        localStorage.setItem(ALBUM_GRID_KEY, "false");
      } else {
        setShowColumnBrowser(true);
        localStorage.setItem(COLUMN_BROWSER_KEY, "true");
      }
      return next;
    });
  }, []);

  const toggleLyricsPanel = useCallback(() => {
    setShowLyricsPanel((prev) => {
      localStorage.setItem(LYRICS_PANEL_KEY, String(!prev));
      return !prev;
    });
  }, []);

  const toggleLyricsOverlay = useCallback(() => {
    setLyricsOverlay((prev) => {
      localStorage.setItem(LYRICS_OVERLAY_KEY, String(!prev));
      return !prev;
    });
  }, []);

  const dismissLyricsOverlay = useCallback(() => {
    setLyricsOverlay(false);
    localStorage.setItem(LYRICS_OVERLAY_KEY, "false");
    setShowLyricsPanel(false);
    localStorage.setItem(LYRICS_PANEL_KEY, "false");
  }, []);

  const toggleFullscreenVisualizer = useCallback(() => {
    setShowFullscreenVisualizer((prev) => {
      localStorage.setItem(FULLSCREEN_VISUALIZER_KEY, String(!prev));
      return !prev;
    });
  }, []);

  return {
    showColumnBrowser,
    showInfoPanel,
    showStatsPanel,
    showPlaylistSidebar,
    showAlbumGrid,
    showTrackList,
    showLyricsPanel,
    showArtworkCarousel,
    lyricsOverlay,
    showFullscreenVisualizer,
    toggleColumnBrowser,
    toggleInfoPanel,
    toggleStatsPanel,
    togglePlaylistSidebar,
    toggleAlbumGrid,
    toggleTrackList,
    toggleArtworkCarousel,
    toggleLyricsPanel,
    toggleLyricsOverlay,
    dismissLyricsOverlay,
    toggleFullscreenVisualizer,
  };
};
