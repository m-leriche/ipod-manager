import { useState } from "react";
import { ProgressProvider } from "./contexts/ProgressContext";
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

type Tab = "browse" | "sync" | "albumart" | "metadata" | "quality" | "youtube" | "video" | "stats";

const App = () => {
  const [tab, setTab] = useState<Tab>("browse");

  return (
    <ProgressProvider>
      <div className="flex flex-col h-screen overflow-hidden bg-bg-primary text-text-primary font-sans antialiased">
        <header className="px-8 py-5 border-b border-border flex items-center shrink-0">
          <h1 className="text-sm font-medium tracking-tight text-text-secondary">Crate</h1>
        </header>
        <main className="flex-1 flex gap-6 p-6 min-h-0">
          <MountPanel compact />
          <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
            <div className="flex gap-1.5 shrink-0">
              <TabButton active={tab === "browse"} onClick={() => setTab("browse")}>
                File Explorer
              </TabButton>
              <TabButton active={tab === "sync"} onClick={() => setTab("sync")}>
                File Sync
              </TabButton>
              <TabButton active={tab === "albumart"} onClick={() => setTab("albumart")}>
                Album Art
              </TabButton>
              <TabButton active={tab === "metadata"} onClick={() => setTab("metadata")}>
                Metadata
              </TabButton>
              <TabButton active={tab === "quality"} onClick={() => setTab("quality")}>
                Quality
              </TabButton>
              <TabButton active={tab === "youtube"} onClick={() => setTab("youtube")}>
                YouTube to Audio
              </TabButton>
              <TabButton active={tab === "video"} onClick={() => setTab("video")}>
                Video to Audio
              </TabButton>
              <TabButton active={tab === "stats"} onClick={() => setTab("stats")}>
                Library Stats
              </TabButton>
            </div>
            {tab === "browse" && <BrowseExplorer />}
            {tab === "sync" && <SyncManager />}
            {tab === "albumart" && <AlbumArtManager />}
            {tab === "metadata" && <MetadataEditor />}
            {tab === "quality" && <QualityAnalyzer />}
            {tab === "youtube" && <YouTubeDownloader />}
            {tab === "video" && <VideoExtractor />}
            {tab === "stats" && <LibraryStats />}
          </div>
        </main>
      </div>
      <ProgressModal />
    </ProgressProvider>
  );
};

const TabButton = ({
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
