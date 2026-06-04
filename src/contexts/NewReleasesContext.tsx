import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  WatchedArtist,
  DiscoveredRelease,
  NewReleasesCheckProgress,
  NewReleasesCheckResult,
} from "../types/releases";

type CheckPhase = "resolving_mbid" | "fetching_releases" | "done" | "";

interface CheckState {
  active: boolean;
  totalArtists: number;
  completedArtists: number;
  currentArtist: string;
  phase: CheckPhase;
}

interface NewReleasesContextValue {
  checkState: CheckState;
  releases: DiscoveredRelease[];
  watchedArtists: WatchedArtist[];
  artistsWithNewReleases: Set<string>;
  hasAnyNewReleases: boolean;
  lastResult: NewReleasesCheckResult | null;

  startCheck: () => Promise<void>;
  cancelCheck: () => Promise<void>;
  watchArtist: (name: string) => Promise<void>;
  unwatchArtist: (name: string) => Promise<void>;
  isWatched: (name: string) => boolean;
  hasNewReleases: (name: string) => boolean;
  dismissRelease: (id: number) => Promise<void>;
  refreshReleases: () => Promise<void>;
  refreshWatchedArtists: () => Promise<void>;
  clearResult: () => void;
}

const INITIAL_CHECK: CheckState = {
  active: false,
  totalArtists: 0,
  completedArtists: 0,
  currentArtist: "",
  phase: "",
};

const NewReleasesContext = createContext<NewReleasesContextValue | null>(null);

export const useNewReleases = (): NewReleasesContextValue => {
  const ctx = useContext(NewReleasesContext);
  if (!ctx) throw new Error("useNewReleases must be used within NewReleasesProvider");
  return ctx;
};

const TWENTY_FOUR_HOURS = 24 * 60 * 60;

export const NewReleasesProvider = ({ children }: { children: React.ReactNode }) => {
  const [checkState, setCheckState] = useState<CheckState>(INITIAL_CHECK);
  const [releases, setReleases] = useState<DiscoveredRelease[]>([]);
  const [watchedArtists, setWatchedArtists] = useState<WatchedArtist[]>([]);
  const [artistsWithNewReleases, setArtistsWithNewReleases] = useState<Set<string>>(new Set());
  const [lastResult, setLastResult] = useState<NewReleasesCheckResult | null>(null);
  const activeRef = useRef(false);
  const watchedArtistsRef = useRef(watchedArtists);
  watchedArtistsRef.current = watchedArtists;

  // ── Data fetching ────────────────────────────────────────────

  const refreshArtistsWithNewReleases = useCallback(async () => {
    try {
      const names = await invoke<string[]>("get_artists_with_new_releases");
      setArtistsWithNewReleases(new Set(names));
    } catch (e) {
      console.warn("Failed to fetch artists with new releases:", e);
    }
  }, []);

  const refreshReleases = useCallback(async () => {
    try {
      const data = await invoke<DiscoveredRelease[]>("get_discovered_releases", {
        includeDismissed: false,
      });
      setReleases(data);
    } catch (e) {
      console.warn("Failed to fetch discovered releases:", e);
    }
  }, []);

  const refreshWatchedArtists = useCallback(async () => {
    try {
      const data = await invoke<WatchedArtist[]>("get_watched_artists");
      setWatchedArtists(data);
    } catch (e) {
      console.warn("Failed to fetch watched artists:", e);
    }
  }, []);

  // ── Initial load ─────────────────────────────────────────────

  useEffect(() => {
    refreshWatchedArtists();
    refreshReleases();
    refreshArtistsWithNewReleases();
  }, [refreshWatchedArtists, refreshReleases, refreshArtistsWithNewReleases]);

  // ── Progress events ──────────────────────────────────────────

  useEffect(() => {
    const unlisten = listen<NewReleasesCheckProgress>("new-releases-check-progress", (event) => {
      const p = event.payload;
      if (p.phase === "done") {
        setCheckState(INITIAL_CHECK);
      } else {
        setCheckState({
          active: true,
          totalArtists: p.total_artists,
          completedArtists: p.completed_artists,
          currentArtist: p.current_artist,
          phase: p.phase,
        });
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // ── Actions ──────────────────────────────────────────────────

  const startCheck = useCallback(async () => {
    if (activeRef.current) return;
    activeRef.current = true;
    setCheckState((prev) => ({ ...prev, active: true }));

    try {
      const result = await invoke<NewReleasesCheckResult>("check_new_releases");
      setLastResult(result);
    } catch (e) {
      console.warn("New releases check failed:", e);
    } finally {
      activeRef.current = false;
      setCheckState(INITIAL_CHECK);
      refreshReleases();
      refreshWatchedArtists();
      refreshArtistsWithNewReleases();
    }
  }, [refreshReleases, refreshWatchedArtists, refreshArtistsWithNewReleases]);

  // ── Auto-check on startup ───────────────────────────────────

  useEffect(() => {
    const autoCheck = async () => {
      const artists = await invoke<WatchedArtist[]>("get_watched_artists");
      if (artists.length === 0) return;

      const lastCheck = await invoke<string | null>("get_last_releases_check");
      const lastCheckTime = lastCheck ? parseInt(lastCheck, 10) : 0;
      const now = Math.floor(Date.now() / 1000);

      if (now - lastCheckTime > TWENTY_FOUR_HOURS) {
        startCheck();
      }
    };
    autoCheck().catch((e) => console.warn("Failed to auto-check new releases:", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelCheck = useCallback(async () => {
    await invoke("cancel_new_releases_check");
  }, []);

  const watchArtist = useCallback(
    async (name: string) => {
      await invoke("watch_artist", { name });
      refreshWatchedArtists();
    },
    [refreshWatchedArtists],
  );

  const unwatchArtist = useCallback(
    async (name: string) => {
      const artist = watchedArtistsRef.current.find((a) => a.name === name);
      if (!artist) return;
      await invoke("unwatch_artist", { id: artist.id });
      refreshWatchedArtists();
      refreshReleases();
      refreshArtistsWithNewReleases();
    },
    [refreshWatchedArtists, refreshReleases, refreshArtistsWithNewReleases],
  );

  const isWatched = useCallback((name: string) => watchedArtists.some((a) => a.name === name), [watchedArtists]);

  const hasNewReleases = useCallback((name: string) => artistsWithNewReleases.has(name), [artistsWithNewReleases]);

  const dismissRelease = useCallback(
    async (id: number) => {
      await invoke("dismiss_release", { id });
      setReleases((prev) => prev.filter((r) => r.id !== id));
      refreshArtistsWithNewReleases();
    },
    [refreshArtistsWithNewReleases],
  );

  const clearResult = useCallback(() => setLastResult(null), []);

  const value: NewReleasesContextValue = {
    checkState,
    releases,
    watchedArtists,
    artistsWithNewReleases,
    hasAnyNewReleases: artistsWithNewReleases.size > 0,
    lastResult,
    startCheck,
    cancelCheck,
    watchArtist,
    unwatchArtist,
    isWatched,
    hasNewReleases,
    dismissRelease,
    refreshReleases,
    refreshWatchedArtists,
    clearResult,
  };

  return <NewReleasesContext.Provider value={value}>{children}</NewReleasesContext.Provider>;
};
