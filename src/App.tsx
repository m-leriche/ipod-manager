import { useState, useRef, useCallback, useEffect, lazy, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { cancelSync } from "./utils/cancelSync";
import { usePanelVisibility } from "./hooks/usePanelVisibility";
import { useMiniPlayer } from "./hooks/useMiniPlayer";
import { useAppEventListeners } from "./hooks/useAppEventListeners";
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
import { NewReleasesProvider, useNewReleases } from "./contexts/NewReleasesContext";
import { ErrorBoundary } from "./components/atoms/ErrorBoundary/ErrorBoundary";
import { RetroWindowDots } from "./components/atoms/RetroWindowDots/RetroWindowDots";
import { ToastContainer } from "./components/atoms/Toast/Toast";
import { StatusBar } from "./components/molecules/StatusBar/StatusBar";
import { MountPanel } from "./components/templates/MountPanel/MountPanel";
import { LibraryPlayer } from "./components/templates/LibraryPlayer/LibraryPlayer";
import { NowPlayingBar } from "./components/organisms/NowPlayingBar/NowPlayingBar";
import { QueuePanel } from "./components/organisms/QueuePanel/QueuePanel";
import { LyricsPanel } from "./components/organisms/LyricsPanel/LyricsPanel";
import { useResizableWidth as useLyricsPanelWidth } from "./components/organisms/LyricsPanel/useResizableWidth";
import type { LibraryScanProgress, LibraryTrack } from "./types/library";
import type { DiskInfo } from "./components/templates/MountPanel/types";
import type { IpodInfo } from "./types/ipod";
import type { LibrarySummary } from "./components/molecules/StatusBar/types";
import { NewReleasesView } from "./components/templates/NewReleasesView/NewReleasesView";

const DiscoverView = lazy(() =>
  import("./components/templates/DiscoverView/DiscoverView").then((m) => ({ default: m.DiscoverView })),
);

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
type TopTab = "library" | "discover" | "tools";
type ToolTab = "ipod" | "files" | "metadata" | "audio" | "duplicates" | "convert" | "health" | "export";
type DiscoverTab = "discover" | "releases";

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
                      <NewReleasesProvider>
                        <AppContent />
                        <ToastContainer />
                      </NewReleasesProvider>
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

const AppContent = () => {
  const { state: playbackState } = usePlayback();
  const [topTab, setTopTab] = useState<TopTab>("library");
  const [toolTab, setToolTab] = useState<ToolTab>("files");
  const [discoverTab, setDiscoverTab] = useState<DiscoverTab>("discover");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const { miniPlayer, toggleMiniPlayer } = useMiniPlayer();
  const lyricsPanelResize = useLyricsPanelWidth();
  const [ipodMounted, setIpodMounted] = useState(false);
  const { hasAnyNewReleases, checkState: releasesCheckState } = useNewReleases();
  const [discoverEnabled, setDiscoverEnabled] = useState(true);

  useEffect(() => {
    invoke<boolean>("get_discover_enabled")
      .then(setDiscoverEnabled)
      .catch(() => {});
  }, []);

  const {
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
  } = usePanelVisibility();

  const [diskInfo, setDiskInfo] = useState<DiskInfo | null>(null);
  const [ipodInfo, setIpodInfo] = useState<IpodInfo | null>(null);
  const [librarySummary, setLibrarySummary] = useState<LibrarySummary | null>(null);
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

  useAppEventListeners({
    onOpenSettings: () => setSettingsOpen(true),
    onLibraryChanged: () => libraryRefreshRef.current?.(),
    onToggleShortcuts: () => setShortcutsOpen((prev) => !prev),
  });

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
        <div className="flex gap-1" role="tablist" aria-label="Main navigation">
          <TopTabButton active={topTab === "library"} onClick={() => setTopTab("library")}>
            Library
          </TopTabButton>
          {discoverEnabled && (
            <TopTabButton
              active={topTab === "discover"}
              onClick={() => setTopTab("discover")}
              indicator={hasAnyNewReleases ? "accent" : releasesCheckState.active ? "pulse" : undefined}
            >
              Discover
            </TopTabButton>
          )}
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
                onLibrarySummaryChange={setLibrarySummary}
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
              />
            </ErrorBoundary>
          </div>
          {topTab === "discover" && (
            <div className="h-full flex flex-col view-enter">
              <div className="px-8 pt-5 pb-4 shrink-0 flex items-center gap-3">
                <div className="inline-flex rounded-lg bg-bg-secondary p-0.5 border border-border">
                  <DiscoverTabButton active={discoverTab === "discover"} onClick={() => setDiscoverTab("discover")}>
                    Discover
                  </DiscoverTabButton>
                  <DiscoverTabButton
                    active={discoverTab === "releases"}
                    onClick={() => setDiscoverTab("releases")}
                    indicator={hasAnyNewReleases ? "accent" : releasesCheckState.active ? "pulse" : undefined}
                  >
                    Releases
                  </DiscoverTabButton>
                </div>
              </div>
              <div className="flex-1 min-h-0">
                {discoverTab === "discover" && (
                  <Suspense fallback={null}>
                    <ErrorBoundary name="Discover">
                      <DiscoverView />
                    </ErrorBoundary>
                  </Suspense>
                )}
                {discoverTab === "releases" && (
                  <ErrorBoundary name="New Releases">
                    <NewReleasesView />
                  </ErrorBoundary>
                )}
              </div>
            </div>
          )}
          {topTab === "tools" && (
            <div className="flex gap-6 p-6 h-full view-enter">
              <ErrorBoundary name="Mount Panel">
                <MountPanel compact onMountChange={setIpodMounted} onDiskInfoChange={setDiskInfo} />
              </ErrorBoundary>
              <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
                <div className="flex gap-1.5 shrink-0" role="tablist" aria-label="Tool tabs">
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

      {!miniPlayer && <StatusBar librarySummary={librarySummary} ipodConnected={ipodMounted} />}

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
              onClose={() => {
                setSettingsOpen(false);
                invoke<boolean>("get_discover_enabled")
                  .then(setDiscoverEnabled)
                  .catch(() => {});
              }}
              onLibraryChanged={() => libraryRefreshRef.current?.()}
            />
          </ErrorBoundary>
        </Suspense>
      )}
      {shortcutsOpen && (
        <Suspense fallback={null}>
          <ErrorBoundary name="Keyboard Shortcuts">
            <KeyboardShortcutsDialog onClose={() => setShortcutsOpen(false)} />
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
  indicator,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  indicator?: "accent" | "pulse";
}) => (
  <button
    role="tab"
    aria-selected={active}
    onClick={onClick}
    className={`relative px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
      active
        ? "bg-bg-card text-text-primary border border-border-active"
        : "text-text-tertiary border border-transparent hover:text-text-secondary"
    }`}
  >
    {children}
    {indicator && (
      <span
        className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${
          indicator === "pulse" ? "bg-accent animate-pulse" : "bg-accent"
        }`}
      />
    )}
  </button>
);

const DiscoverTabButton = ({
  active,
  onClick,
  children,
  indicator,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  indicator?: "accent" | "pulse";
}) => (
  <button
    role="tab"
    aria-selected={active}
    onClick={onClick}
    className={`relative px-3 py-1 rounded-md text-[11px] font-medium transition-all ${
      active ? "bg-bg-card text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-secondary"
    }`}
  >
    {children}
    {indicator && (
      <span
        className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${
          indicator === "pulse" ? "bg-accent animate-pulse" : "bg-accent"
        }`}
      />
    )}
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
    role="tab"
    aria-selected={active}
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
