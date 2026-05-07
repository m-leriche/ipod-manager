import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  WatchedArtist,
  DiscoveredRelease,
  NewReleasesCheckProgress,
  NewReleasesCheckResult,
} from "../types/releases";

interface CheckState {
  active: boolean;
  totalArtists: number;
  completedArtists: number;
  currentArtist: string;
  phase: string;
}

interface NewReleasesActions {
  checkState: CheckState;
  releases: DiscoveredRelease[];
  watchedArtists: WatchedArtist[];
  newReleaseCount: number;
  startCheck: () => void;
  cancelCheck: () => void;
  watchArtist: (name: string) => Promise<void>;
  unwatchArtist: (id: number) => Promise<void>;
  isWatched: (name: string) => boolean;
  dismissRelease: (id: number) => Promise<void>;
  refreshReleases: () => Promise<void>;
  refreshWatchedArtists: () => Promise<void>;
  lastResult: NewReleasesCheckResult | null;
  clearResult: () => void;
}

const defaultCheckState: CheckState = {
  active: false,
  totalArtists: 0,
  completedArtists: 0,
  currentArtist: "",
  phase: "",
};

const NewReleasesContext = createContext<NewReleasesActions>({
  checkState: defaultCheckState,
  releases: [],
  watchedArtists: [],
  newReleaseCount: 0,
  startCheck: () => {},
  cancelCheck: () => {},
  watchArtist: async () => {},
  unwatchArtist: async () => {},
  isWatched: () => false,
  dismissRelease: async () => {},
  refreshReleases: async () => {},
  refreshWatchedArtists: async () => {},
  lastResult: null,
  clearResult: () => {},
});

export const NewReleasesProvider = ({ children }: { children: React.ReactNode }) => {
  const [checkState, setCheckState] = useState<CheckState>(defaultCheckState);
  const [releases, setReleases] = useState<DiscoveredRelease[]>([]);
  const [watchedArtists, setWatchedArtists] = useState<WatchedArtist[]>([]);
  const [lastResult, setLastResult] = useState<NewReleasesCheckResult | null>(null);
  const activeRef = useRef(false);

  const refreshReleases = useCallback(async () => {
    try {
      const data = await invoke<DiscoveredRelease[]>("get_discovered_releases", {
        includeDismissed: false,
      });
      setReleases(data);
    } catch {
      // silently fail on initial load
    }
  }, []);

  const refreshWatchedArtists = useCallback(async () => {
    try {
      const data = await invoke<WatchedArtist[]>("get_watched_artists");
      setWatchedArtists(data);
    } catch {
      // silently fail on initial load
    }
  }, []);

  // Load data on mount
  useEffect(() => {
    refreshReleases();
    refreshWatchedArtists();
  }, [refreshReleases, refreshWatchedArtists]);

  const startCheck = useCallback(async () => {
    if (activeRef.current) return;
    activeRef.current = true;
    setCheckState({
      active: true,
      totalArtists: 0,
      completedArtists: 0,
      currentArtist: "Starting...",
      phase: "resolving_mbid",
    });

    const unlisten = await listen<NewReleasesCheckProgress>("new-releases-check-progress", (e) => {
      setCheckState({
        active: true,
        totalArtists: e.payload.total_artists,
        completedArtists: e.payload.completed_artists,
        currentArtist: e.payload.current_artist,
        phase: e.payload.phase,
      });
    });

    try {
      const result = await invoke<NewReleasesCheckResult>("check_new_releases");
      setLastResult(result);
      await refreshReleases();
      await refreshWatchedArtists();
    } catch {
      // check failed
    } finally {
      unlisten();
      activeRef.current = false;
      setCheckState(defaultCheckState);
    }
  }, [refreshReleases, refreshWatchedArtists]);

  const cancelCheck = useCallback(() => {
    invoke("cancel_new_releases_check").catch(() => {});
  }, []);

  const watchArtist = useCallback(
    async (name: string) => {
      await invoke("watch_artist", { name });
      await refreshWatchedArtists();
    },
    [refreshWatchedArtists],
  );

  const unwatchArtist = useCallback(
    async (id: number) => {
      await invoke("unwatch_artist", { id });
      await refreshWatchedArtists();
      await refreshReleases();
    },
    [refreshWatchedArtists, refreshReleases],
  );

  const isWatched = useCallback((name: string) => watchedArtists.some((a) => a.name === name), [watchedArtists]);

  const dismissRelease = useCallback(async (id: number) => {
    await invoke("dismiss_release", { id });
    setReleases((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const clearResult = useCallback(() => setLastResult(null), []);

  const newReleaseCount = releases.filter((r) => !r.in_library).length;

  return (
    <NewReleasesContext.Provider
      value={{
        checkState,
        releases,
        watchedArtists,
        newReleaseCount,
        startCheck,
        cancelCheck,
        watchArtist,
        unwatchArtist,
        isWatched,
        dismissRelease,
        refreshReleases,
        refreshWatchedArtists,
        lastResult,
        clearResult,
      }}
    >
      {children}
    </NewReleasesContext.Provider>
  );
};

export const useNewReleases = (): NewReleasesActions => useContext(NewReleasesContext);
