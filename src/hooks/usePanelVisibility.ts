import { useState, useCallback } from "react";
import { getSetting, setSetting } from "../utils/settings";

export const usePanelVisibility = () => {
  const [showColumnBrowser, setShowColumnBrowser] = useState(() => getSetting("showColumnBrowser"));
  const [showInfoPanel, setShowInfoPanel] = useState(() => getSetting("showInfoPanel"));
  const [showStatsPanel, setShowStatsPanel] = useState(() => getSetting("showStatsPanel"));
  const [showPlaylistSidebar, setShowPlaylistSidebar] = useState(() => getSetting("showPlaylistSidebar"));
  const [showAlbumGrid, setShowAlbumGrid] = useState(() => getSetting("showAlbumGrid"));
  const [showTrackList, setShowTrackList] = useState(() => getSetting("showTrackList"));
  const [showLyricsPanel, setShowLyricsPanel] = useState(() => getSetting("showLyricsPanel"));
  const [showArtworkCarousel, setShowArtworkCarousel] = useState(() => getSetting("showArtworkCarousel"));
  const [lyricsOverlay, setLyricsOverlay] = useState(() => getSetting("lyricsOverlay"));

  const toggleColumnBrowser = useCallback(() => {
    // If another browser mode is active, switch to column browser
    if (showAlbumGrid || showArtworkCarousel) {
      setShowAlbumGrid(false);
      setSetting("showAlbumGrid", false);
      setShowArtworkCarousel(false);
      setSetting("showArtworkCarousel", false);
      setShowColumnBrowser(true);
      setSetting("showColumnBrowser", true);
      return;
    }
    setShowColumnBrowser((prev) => {
      setSetting("showColumnBrowser", !prev);
      return !prev;
    });
  }, [showAlbumGrid, showArtworkCarousel]);

  const toggleInfoPanel = useCallback(() => {
    setShowInfoPanel((prev) => {
      setSetting("showInfoPanel", !prev);
      return !prev;
    });
  }, []);

  const toggleStatsPanel = useCallback(() => {
    setShowStatsPanel((prev) => {
      setSetting("showStatsPanel", !prev);
      return !prev;
    });
  }, []);

  const togglePlaylistSidebar = useCallback(() => {
    setShowPlaylistSidebar((prev) => {
      setSetting("showPlaylistSidebar", !prev);
      return !prev;
    });
  }, []);

  const toggleAlbumGrid = useCallback(() => {
    setShowAlbumGrid((prev) => {
      const next = !prev;
      setSetting("showAlbumGrid", next);
      if (next) {
        setShowColumnBrowser(false);
        setSetting("showColumnBrowser", false);
        setShowArtworkCarousel(false);
        setSetting("showArtworkCarousel", false);
      } else {
        setShowColumnBrowser(true);
        setSetting("showColumnBrowser", true);
      }
      return next;
    });
  }, []);

  const toggleTrackList = useCallback(() => {
    setShowTrackList((prev) => {
      setSetting("showTrackList", !prev);
      return !prev;
    });
  }, []);

  const toggleArtworkCarousel = useCallback(() => {
    setShowArtworkCarousel((prev) => {
      const next = !prev;
      setSetting("showArtworkCarousel", next);
      if (next) {
        setShowColumnBrowser(false);
        setSetting("showColumnBrowser", false);
        setShowAlbumGrid(false);
        setSetting("showAlbumGrid", false);
      } else {
        setShowColumnBrowser(true);
        setSetting("showColumnBrowser", true);
      }
      return next;
    });
  }, []);

  const toggleLyricsPanel = useCallback(() => {
    setShowLyricsPanel((prev) => {
      setSetting("showLyricsPanel", !prev);
      return !prev;
    });
  }, []);

  const toggleLyricsOverlay = useCallback(() => {
    setLyricsOverlay((prev) => {
      setSetting("lyricsOverlay", !prev);
      return !prev;
    });
  }, []);

  const dismissLyricsOverlay = useCallback(() => {
    setLyricsOverlay(false);
    setSetting("lyricsOverlay", false);
    setShowLyricsPanel(false);
    setSetting("showLyricsPanel", false);
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
  };
};
