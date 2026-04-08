import { useState } from "react";
import { MountPanel } from "./components/MountPanel";
import { SyncManager } from "./components/SyncManager";

function App() {
  const [isMounted, setIsMounted] = useState(false);

  return (
    <div className="flex flex-col min-h-screen bg-bg-primary text-text-primary font-sans antialiased">
      <header className="px-6 py-4 border-b border-border flex items-center">
        <h1 className="text-sm font-medium tracking-tight text-text-secondary">
          iPod Manager
        </h1>
      </header>
      <main
        className={`flex-1 flex ${
          isMounted ? "gap-4 p-4" : "justify-center p-8"
        } items-start`}
      >
        <MountPanel onMountChange={setIsMounted} compact={isMounted} />
        {isMounted && <SyncManager />}
      </main>
    </div>
  );
}

export default App;
