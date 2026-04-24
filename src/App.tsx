import { useState, useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ProgressProvider, useProgress } from "./contexts/ProgressContext";
import { PlaybackProvider } from "./contexts/PlaybackContext";
import { ProgressModal } from "./components/atoms/ProgressModal/ProgressModal";
import { MountPanel } from "./components/templates/MountPanel/MountPanel";
import { BrowseExplorer } from "./components/templates/BrowseExplorer/BrowseExplorer";
import { SyncManager } from "./components/templates/SyncManager/SyncManager";
import { AudioExtractor } from "./components/templates/AudioExtractor/AudioExtractor";
import { MetadataEditor } from "./components/templates/MetadataEditor/MetadataEditor";
import { LibraryStats } from "./components/templates/LibraryStats/LibraryStats";
import { IpodSummary } from "./components/templates/IpodSummary/IpodSummary";
import { LibraryPlayer } from "./components/templates/LibraryPlayer/LibraryPlayer";
import { NowPlayingBar } from "./components/organisms/NowPlayingBar/NowPlayingBar";
import { SettingsModal } from "./components/templates/SettingsModal/SettingsModal";
import type { LibraryScanProgress } from "./types/library";
import type { DiskInfo } from "./components/templates/MountPanel/types";
import type { IpodInfo } from "./types/ipod";

type TopTab = "library" | "tools";
type ToolTab = "ipod" | "browse" | "sync" | "metadata" | "audio" | "stats";

const App = () => (
  <ProgressProvider>
    <PlaybackProvider>
      <AppContent />
      <ProgressModal />
    </PlaybackProvider>
  </ProgressProvider>
);

const AppContent = () => {
  const [topTab, setTopTab] = useState<TopTab>("library");
  const [toolTab, setToolTab] = useState<ToolTab>("browse");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ipodMounted, setIpodMounted] = useState(false);
  const [diskInfo, setDiskInfo] = useState<DiskInfo | null>(null);
  const [ipodInfo, setIpodInfo] = useState<IpodInfo | null>(null);
  const prevMountedRef = useRef(false);
  const { start: startProgress, update: updateProgress, finish: finishProgress, fail: failProgress } = useProgress();
  const libraryRefreshRef = useRef<(() => void) | null>(null);

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

  const handleRescan = useCallback(async () => {
    startProgress("Rescanning library...", () => invoke("cancel_sync"));

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
      <header className="px-8 py-4 border-b border-border flex items-center gap-6 shrink-0">
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

      <main className="flex-1 min-h-0 relative">
        {/* Library stays mounted always — hidden via CSS to preserve state */}
        <div className={`h-full ${topTab === "library" ? "" : "hidden"}`}>
          <LibraryPlayer onRefreshRef={libraryRefreshRef} isActive={topTab === "library"} />
        </div>
        {topTab === "tools" && (
          <div className="flex gap-6 p-6 h-full">
            <MountPanel compact onMountChange={setIpodMounted} onDiskInfoChange={setDiskInfo} />
            <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
              <div className="flex gap-1.5 shrink-0">
                <ToolTabButton active={toolTab === "ipod"} onClick={() => setToolTab("ipod")}>
                  iPod
                </ToolTabButton>
                <ToolTabButton active={toolTab === "browse"} onClick={() => setToolTab("browse")}>
                  File Explorer
                </ToolTabButton>
                <ToolTabButton active={toolTab === "sync"} onClick={() => setToolTab("sync")}>
                  File Sync
                </ToolTabButton>
                <ToolTabButton active={toolTab === "metadata"} onClick={() => setToolTab("metadata")}>
                  Metadata
                </ToolTabButton>
                <ToolTabButton active={toolTab === "audio"} onClick={() => setToolTab("audio")}>
                  Audio Extractor
                </ToolTabButton>
                <ToolTabButton active={toolTab === "stats"} onClick={() => setToolTab("stats")}>
                  Library Stats
                </ToolTabButton>
              </div>
              {toolTab === "ipod" && (
                <IpodSummary
                  diskInfo={diskInfo}
                  isMounted={ipodMounted}
                  cachedInfo={ipodInfo}
                  onInfoLoaded={setIpodInfo}
                />
              )}
              {toolTab === "browse" && <BrowseExplorer />}
              {toolTab === "sync" && <SyncManager />}
              {toolTab === "metadata" && <MetadataEditor />}
              {toolTab === "audio" && <AudioExtractor />}
              {toolTab === "stats" && <LibraryStats />}
            </div>
          </div>
        )}
      </main>

      <NowPlayingBar />

      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} onLibraryChanged={() => libraryRefreshRef.current?.()} />
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
