import { useState } from "react";
import { ProgressProvider } from "./contexts/ProgressContext";
import { PlaybackProvider } from "./contexts/PlaybackContext";
import { ProgressModal } from "./components/atoms/ProgressModal/ProgressModal";
import { MountPanel } from "./components/templates/MountPanel/MountPanel";
import { BrowseExplorer } from "./components/templates/BrowseExplorer/BrowseExplorer";
import { SyncManager } from "./components/templates/SyncManager/SyncManager";
import { AlbumArtManager } from "./components/templates/AlbumArtManager/AlbumArtManager";
import { YouTubeDownloader } from "./components/templates/YouTubeDownloader/YouTubeDownloader";
import { VideoExtractor } from "./components/templates/VideoExtractor/VideoExtractor";
import { MetadataEditor } from "./components/templates/MetadataEditor/MetadataEditor";
import { QualityAnalyzer } from "./components/templates/QualityAnalyzer/QualityAnalyzer";
import { LibraryStats } from "./components/templates/LibraryStats/LibraryStats";
import { LibraryPlayer } from "./components/templates/LibraryPlayer/LibraryPlayer";
import { NowPlayingBar } from "./components/organisms/NowPlayingBar/NowPlayingBar";

type TopTab = "library" | "tools";
type ToolTab = "browse" | "sync" | "albumart" | "metadata" | "quality" | "youtube" | "video" | "stats";

const App = () => {
  const [topTab, setTopTab] = useState<TopTab>("library");
  const [toolTab, setToolTab] = useState<ToolTab>("browse");

  return (
    <ProgressProvider>
      <PlaybackProvider>
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
          </header>

          <main className="flex-1 min-h-0 relative">
            {/* Library stays mounted always — hidden via CSS to preserve state */}
            <div className={`h-full ${topTab === "library" ? "" : "hidden"}`}>
              <LibraryPlayer />
            </div>
            {topTab === "tools" && (
              <div className="flex gap-6 p-6 h-full">
                <MountPanel compact />
                <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
                  <div className="flex gap-1.5 shrink-0">
                    <ToolTabButton active={toolTab === "browse"} onClick={() => setToolTab("browse")}>
                      File Explorer
                    </ToolTabButton>
                    <ToolTabButton active={toolTab === "sync"} onClick={() => setToolTab("sync")}>
                      File Sync
                    </ToolTabButton>
                    <ToolTabButton active={toolTab === "albumart"} onClick={() => setToolTab("albumart")}>
                      Album Art
                    </ToolTabButton>
                    <ToolTabButton active={toolTab === "metadata"} onClick={() => setToolTab("metadata")}>
                      Metadata
                    </ToolTabButton>
                    <ToolTabButton active={toolTab === "quality"} onClick={() => setToolTab("quality")}>
                      Quality
                    </ToolTabButton>
                    <ToolTabButton active={toolTab === "youtube"} onClick={() => setToolTab("youtube")}>
                      YouTube to Audio
                    </ToolTabButton>
                    <ToolTabButton active={toolTab === "video"} onClick={() => setToolTab("video")}>
                      Video to Audio
                    </ToolTabButton>
                    <ToolTabButton active={toolTab === "stats"} onClick={() => setToolTab("stats")}>
                      Library Stats
                    </ToolTabButton>
                  </div>
                  {toolTab === "browse" && <BrowseExplorer />}
                  {toolTab === "sync" && <SyncManager />}
                  {toolTab === "albumart" && <AlbumArtManager />}
                  {toolTab === "metadata" && <MetadataEditor />}
                  {toolTab === "quality" && <QualityAnalyzer />}
                  {toolTab === "youtube" && <YouTubeDownloader />}
                  {toolTab === "video" && <VideoExtractor />}
                  {toolTab === "stats" && <LibraryStats />}
                </div>
              </div>
            )}
          </main>

          <NowPlayingBar />
        </div>
        <ProgressModal />
      </PlaybackProvider>
    </ProgressProvider>
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
