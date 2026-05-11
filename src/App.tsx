import { useState, useRef, useCallback, useEffect, lazy, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize, PhysicalSize } from "@tauri-apps/api/dpi";
import { cancelSync } from "./utils/cancelSync";
import { ProgressProvider, useProgress } from "./contexts/ProgressContext";
import { PlaybackProvider, usePlayback } from "./contexts/PlaybackContext";
import { EqualizerProvider } from "./contexts/EqualizerContext";
import { PlaylistProvider } from "./contexts/PlaylistContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ToastProvider } from "./contexts/ToastContext";
import { LastfmProvider } from "./contexts/LastfmContext";
import { ArtCacheProvider } from "./contexts/ArtCacheContext";
import { BackgroundArtRepairProvider } from "./contexts/BackgroundArtRepairContext";
import { BackgroundLyricsProvider } from "./contexts/BackgroundLyricsContext";
import { ErrorBoundary } from "./components/atoms/ErrorBoundary/ErrorBoundary";
import { RetroWindowDots } from "./components/atoms/RetroWindowDots/RetroWindowDots";
import { ProgressModal } from "./components/atoms/ProgressModal/ProgressModal";
import { ToastContainer } from "./components/atoms/Toast/Toast";
import { MountPanel } from "./components/templates/MountPanel/MountPanel";
import { LibraryPlayer } from "./components/templates/LibraryPlayer/LibraryPlayer";
import { NowPlayingBar } from "./components/organisms/NowPlayingBar/NowPlayingBar";
import { QueuePanel } from "./components/organisms/QueuePanel/QueuePanel";
import { LyricsPanel } from "./components/organisms/LyricsPanel/LyricsPanel";
import { useResizableWidth as useLyricsPanelWidth } from "./components/organisms/LyricsPanel/useResizableWidth";
import type { LibraryScanProgress, LibraryTrack } from "./types/library";
import type { DiskInfo } from "./components/templates/MountPanel/types";
import type { IpodInfo } from "./types/ipod";

// Lazy-loaded tool tabs and modals (only loaded when the user navigates to them)
const FileManager = lazy(() =>
  import("./components/templates/FileManager/FileManager").then((m) => ({ default: m.FileManager })),
);
const AudioExtractor = lazy(() =>
  import("./components/templates/AudioExtractor/AudioExtractor").then((m) => ({ default: m.AudioExtractor })),
);
const MetadataEditor = lazy(() =>
  import("./components/templates/MetadataEditor/MetadataEditor").then((m) => ({ default: m.MetadataEditor })),
);
const IpodSummary = lazy(() =>
  import("./components/templates/IpodSummary/IpodSummary").then((m) => ({ default: m.IpodSummary })),
);
const DuplicateDetector = lazy(() =>
  import("./components/templates/DuplicateDetector/DuplicateDetector").then((m) => ({
    default: m.DuplicateDetector,
  })),
);
const AudioConverter = lazy(() =>
  import("./components/templates/AudioConverter/AudioConverter").then((m) => ({ default: m.AudioConverter })),
);
const LibraryHealthDashboard = lazy(() =>
  import("./components/templates/LibraryHealthDashboard/LibraryHealthDashboard").then((m) => ({
    default: m.LibraryHealthDashboard,
  })),
);
const LibraryExport = lazy(() =>
  import("./components/templates/LibraryExport/LibraryExport").then((m) => ({ default: m.LibraryExport })),
);
const SettingsModal = lazy(() =>
  import("./components/templates/SettingsModal/SettingsModal").then((m) => ({ default: m.SettingsModal })),
);
const KeyboardShortcutsDialog = lazy(() =>
  import("./components/atoms/KeyboardShortcutsDialog/KeyboardShortcutsDialog").then((m) => ({
    default: m.KeyboardShortcutsDialog,
  })),
);
const FullscreenVisualizer = lazy(() =>
  import("./components/templates/FullscreenVisualizer/FullscreenVisualizer").then((m) => ({
    default: m.FullscreenVisualizer,
  })),
);

type TopTab = "library" | "tools";
type ToolTab = "ipod" | "files" | "metadata" | "audio" | "duplicates" | "convert" | "health" | "export";

const App = () => (
  <ThemeProvider>
    <ToastProvider>
      <LastfmProvider>
        <ProgressProvider>
          <ArtCacheProvider>
            <BackgroundArtRepairProvider>
              <BackgroundLyricsProvider>
                <EqualizerProvider>
                  <PlaybackProvider>
                    <PlaylistProvider>
                      <AppContent />
                      <ProgressModal />
                      <ToastContainer />
                    </PlaylistProvider>
                  </PlaybackProvider>
                </EqualizerProvider>
              </BackgroundLyricsProvider>
            </BackgroundArtRepairProvider>
          </ArtCacheProvider>
        </ProgressProvider>
      </LastfmProvider>
    </ToastProvider>
  </ThemeProvider>
);

// Panel visibility localStorage keys
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

const AppContent = () => {
  const { state: playbackState } = usePlayback();
  const [topTab, setTopTab] = useState<TopTab>("library");
  const [toolTab, setToolTab] = useState<ToolTab>("files");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [miniPlayer, setMiniPlayer] = useState(false);
  const savedSizeRef = useRef<{ width: number; height: number } | null>(null);
  const lyricsPanelResize = useLyricsPanelWidth();
  const [ipodMounted, setIpodMounted] = useState(false);

  // Panel visibility state (shared between LibraryPlayer and NowPlayingBar)
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
  const [diskInfo, setDiskInfo] = useState<DiskInfo | null>(null);
  const [ipodInfo, setIpodInfo] = useState<IpodInfo | null>(null);
  const prevMountedRef = useRef(false);
  const { start: startProgress, update: updateProgress, finish: finishProgress, fail: failProgress } = useProgress();
  const libraryRefreshRef = useRef<(() => void) | null>(null);
  const [metadataRepairPaths, setMetadataRepairPaths] = useState<string[] | null>(null);

  const handleRepairMetadata = useCallback((tracks: LibraryTrack[]) => {
    setMetadataRepairPaths(tracks.map((t) => t.file_path));
    setTopTab("tools");
    setToolTab("metadata");
  }, []);

  useEffect(() => {
    if (ipodMounted && !prevMountedRef.current) {
      setTopTab("tools");
      setToolTab("ipod");
    }
    prevMountedRef.current = ipodMounted;
  }, [ipodMounted]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("open-settings", () => setSettingsOpen(true)).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  // Auto-refresh library when filesystem watcher detects changes
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("library-changed", () => {
      libraryRefreshRef.current?.();
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  // Global Cmd+/ to open keyboard shortcuts dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const toggleMiniPlayer = useCallback(async () => {
    const win = getCurrentWindow();
    if (!miniPlayer) {
      // Save current size before shrinking
      const size = await win.innerSize();
      savedSizeRef.current = { width: size.width, height: size.height };
      await win.setMinSize(new LogicalSize(300, 380));
      await win.setSize(new LogicalSize(300, 380));
      await win.setAlwaysOnTop(true);
      setMiniPlayer(true);
    } else {
      await win.setAlwaysOnTop(false);
      await win.setMinSize(null);
      const saved = savedSizeRef.current;
      if (saved) {
        // innerSize() returns physical pixels, so restore with PhysicalSize
        await win.setSize(new PhysicalSize(saved.width, saved.height));
      } else {
        await win.setSize(new LogicalSize(1200, 800));
      }
      setMiniPlayer(false);
    }
  }, [miniPlayer]);

  const handleRescan = useCallback(async () => {
    startProgress("Rescanning library...", cancelSync);

    const unlisten = await listen<LibraryScanProgress>("library-scan-progress", (e) => {
      updateProgress(e.payload.completed, e.payload.total, e.payload.current_file);
    });

    try {
      await invoke("refresh_library");
      libraryRefreshRef.current?.();
      finishProgress("Library rescan complete");
    } catch (e) {
      failProgress(`Rescan failed: ${e}`);
    } finally {
      unlisten();
    }
  }, [startProgress, updateProgress, finishProgress, failProgress]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg-primary text-text-primary font-sans antialiased">
      <header
        className={`px-8 py-4 border-b border-border flex items-center gap-6 shrink-0 ${miniPlayer ? "hidden" : ""}`}
      >
        <RetroWindowDots />
        <h1 className="text-sm font-medium tracking-tight text-text-secondary">Crate</h1>
        <div className="flex gap-1">
          <TopTabButton active={topTab === "library"} onClick={() => setTopTab("library")}>
            Library
          </TopTabButton>
          <TopTabButton active={topTab === "tools"} onClick={() => setTopTab("tools")}>
            Tools
          </TopTabButton>
        </div>
        <div className="flex-1" />
        <button
          onClick={handleRescan}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium text-text-tertiary hover:text-text-secondary transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
            />
          </svg>
          Rescan Library
        </button>
      </header>

      <main className={`flex-1 min-h-0 relative flex ${miniPlayer ? "hidden" : ""}`}>
        <div className="flex-1 min-w-0 min-h-0 relative">
          {/* Library stays mounted always — hidden via CSS to preserve state */}
          <div
            className={`h-full transition-opacity duration-150 ${topTab === "library" ? "opacity-100" : "opacity-0 pointer-events-none absolute inset-0"}`}
          >
            <ErrorBoundary name="Library">
              <LibraryPlayer
                onRefreshRef={libraryRefreshRef}
                isActive={topTab === "library"}
                onRepairMetadata={handleRepairMetadata}
                showColumnBrowser={showColumnBrowser}
                showInfoPanel={showInfoPanel}
                showStatsPanel={showStatsPanel}
                showPlaylistSidebar={showPlaylistSidebar}
                showAlbumGrid={showAlbumGrid}
                showTrackList={showTrackList}
                showArtworkCarousel={showArtworkCarousel}
                showLyricsPanel={showLyricsPanel}
                lyricsOverlay={lyricsOverlay && showLyricsPanel}
                onLyricsOverlayDismiss={dismissLyricsOverlay}
                onToggleColumnBrowser={toggleColumnBrowser}
                onTogglePlaylistSidebar={togglePlaylistSidebar}
                onToggleAlbumGrid={toggleAlbumGrid}
                onToggleArtworkCarousel={toggleArtworkCarousel}
                onToggleTrackList={toggleTrackList}
                onToggleLyricsPanel={toggleLyricsPanel}
                onToggleLyricsOverlay={toggleLyricsOverlay}
                showFullscreenVisualizer={showFullscreenVisualizer}
                onToggleFullscreenVisualizer={toggleFullscreenVisualizer}
              />
            </ErrorBoundary>
          </div>
          {topTab === "tools" && (
            <div className="flex gap-6 p-6 h-full view-enter">
              <ErrorBoundary name="Mount Panel">
                <MountPanel compact onMountChange={setIpodMounted} onDiskInfoChange={setDiskInfo} />
              </ErrorBoundary>
              <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
                <div className="flex gap-1.5 shrink-0">
                  <ToolTabButton active={toolTab === "ipod"} onClick={() => setToolTab("ipod")}>
                    iPod
                  </ToolTabButton>
                  <ToolTabButton active={toolTab === "files"} onClick={() => setToolTab("files")}>
                    File Manager
                  </ToolTabButton>
                  <ToolTabButton active={toolTab === "metadata"} onClick={() => setToolTab("metadata")}>
                    Metadata
                  </ToolTabButton>
                  <ToolTabButton active={toolTab === "audio"} onClick={() => setToolTab("audio")}>
                    Audio Extractor
                  </ToolTabButton>
                  <ToolTabButton active={toolTab === "duplicates"} onClick={() => setToolTab("duplicates")}>
                    Duplicates
                  </ToolTabButton>
                  <ToolTabButton active={toolTab === "convert"} onClick={() => setToolTab("convert")}>
                    Converter
                  </ToolTabButton>
                  <ToolTabButton active={toolTab === "health"} onClick={() => setToolTab("health")}>
                    Health
                  </ToolTabButton>
                  <ToolTabButton active={toolTab === "export"} onClick={() => setToolTab("export")}>
                    Export / Import
                  </ToolTabButton>
                </div>
                <Suspense fallback={null}>
                  <div key={toolTab} className="flex-1 min-h-0 flex flex-col view-enter">
                    {toolTab === "ipod" && (
                      <ErrorBoundary name="iPod Summary">
                        <IpodSummary
                          diskInfo={diskInfo}
                          isMounted={ipodMounted}
                          cachedInfo={ipodInfo}
                          onInfoLoaded={setIpodInfo}
                        />
                      </ErrorBoundary>
                    )}
                    {toolTab === "files" && (
                      <ErrorBoundary name="File Manager">
                        <FileManager />
                      </ErrorBoundary>
                    )}
                    {toolTab === "metadata" && (
                      <ErrorBoundary name="Metadata Editor">
                        <MetadataEditor
                          initialPaths={metadataRepairPaths}
                          onInitialPathsConsumed={() => setMetadataRepairPaths(null)}
                        />
                      </ErrorBoundary>
                    )}
                    {toolTab === "audio" && (
                      <ErrorBoundary name="Audio Extractor">
                        <AudioExtractor />
                      </ErrorBoundary>
                    )}
                    {toolTab === "duplicates" && (
                      <ErrorBoundary name="Duplicate Detector">
                        <DuplicateDetector />
                      </ErrorBoundary>
                    )}
                    {toolTab === "convert" && (
                      <ErrorBoundary name="Audio Converter">
                        <AudioConverter />
                      </ErrorBoundary>
                    )}
                    {toolTab === "health" && (
                      <ErrorBoundary name="Library Health">
                        <LibraryHealthDashboard onRepairMetadata={handleRepairMetadata} />
                      </ErrorBoundary>
                    )}
                    {toolTab === "export" && (
                      <ErrorBoundary name="Library Export">
                        <LibraryExport />
                      </ErrorBoundary>
                    )}
                  </div>
                </Suspense>
              </div>
            </div>
          )}
        </div>
        {topTab === "library" &&
          showLyricsPanel &&
          !(lyricsOverlay && showArtworkCarousel) &&
          playbackState.currentTrack && (
            <div style={{ width: lyricsPanelResize.width }} className="relative shrink-0 border-l border-border">
              <div
                onMouseDown={lyricsPanelResize.onDragStart}
                className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/30 active:bg-accent/50 transition-colors z-10"
              />
              <ErrorBoundary name="Lyrics" compact>
                <LyricsPanel track={playbackState.currentTrack} />
              </ErrorBoundary>
            </div>
          )}
        {queueOpen && (
          <ErrorBoundary name="Queue">
            <QueuePanel onClose={() => setQueueOpen(false)} />
          </ErrorBoundary>
        )}
      </main>

      <ErrorBoundary name="Now Playing" compact>
        <NowPlayingBar
          onToggleQueue={() => setQueueOpen((prev) => !prev)}
          queueOpen={queueOpen}
          onToggleMiniPlayer={toggleMiniPlayer}
          miniPlayer={miniPlayer}
          showInfoPanel={showInfoPanel}
          showStatsPanel={showStatsPanel}
          onToggleInfoPanel={toggleInfoPanel}
          onToggleStatsPanel={toggleStatsPanel}
        />
      </ErrorBoundary>

      {settingsOpen && (
        <Suspense fallback={null}>
          <ErrorBoundary name="Settings">
            <SettingsModal
              onClose={() => setSettingsOpen(false)}
              onLibraryChanged={() => libraryRefreshRef.current?.()}
            />
          </ErrorBoundary>
        </Suspense>
      )}
      {shortcutsOpen && (
        <Suspense fallback={null}>
          <KeyboardShortcutsDialog onClose={() => setShortcutsOpen(false)} />
        </Suspense>
      )}
      {showFullscreenVisualizer && (
        <Suspense fallback={null}>
          <ErrorBoundary name="Visualizer">
            <FullscreenVisualizer onClose={toggleFullscreenVisualizer} />
          </ErrorBoundary>
        </Suspense>
      )}
    </div>
  );
};

const TopTabButton = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
      active
        ? "bg-bg-card text-text-primary border border-border-active"
        : "text-text-tertiary border border-transparent hover:text-text-secondary"
    }`}
  >
    {children}
  </button>
);

const ToolTabButton = ({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
      disabled
        ? "text-text-tertiary/40 border border-transparent cursor-not-allowed"
        : active
          ? "bg-bg-card text-text-primary border border-border-active"
          : "text-text-tertiary border border-transparent hover:text-text-secondary"
    }`}
  >
    {children}
  </button>
);

export default App;
