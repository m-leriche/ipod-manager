import { useState } from "react";
import { MountPanel } from "./components/MountPanel";
import { SyncManager } from "./components/SyncManager";
import { AlbumArtManager } from "./components/AlbumArtManager";

type Tab = "sync" | "albumart";

function App() {
  const [isMounted, setIsMounted] = useState(false);
  const [tab, setTab] = useState<Tab>("albumart");

  return (
    <div className="flex flex-col min-h-screen bg-bg-primary text-text-primary font-sans antialiased">
      <header className="px-6 py-4 border-b border-border flex items-center">
        <h1 className="text-sm font-medium tracking-tight text-text-secondary">
          iPod Manager
        </h1>
      </header>
      <main className="flex-1 flex gap-4 p-4 items-start">
        <MountPanel onMountChange={setIsMounted} compact />
        <div className="flex-1 min-w-0 flex flex-col gap-2.5 max-h-[calc(100vh-72px)]">
          <div className="flex gap-1 shrink-0">
            <TabButton
              active={tab === "sync"}
              disabled={!isMounted}
              onClick={() => setTab("sync")}
            >
              File Sync
            </TabButton>
            <TabButton active={tab === "albumart"} onClick={() => setTab("albumart")}>
              Album Art
            </TabButton>
          </div>
          {tab === "sync" && isMounted ? <SyncManager /> : <AlbumArtManager />}
        </div>
      </main>
    </div>
  );
}

function TabButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
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
}

export default App;
