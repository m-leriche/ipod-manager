import { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { pickFolder } from "../utils/pickPath";
import type {
  Playlist,
  PlaylistTrack,
  LibraryTrack,
  PlaylistExportResult,
  SmartPlaylist,
  SmartPlaylistRuleGroup,
} from "../types/library";

// ── Types ───────────────────────────────────────────────────────

interface PlaylistContextValue {
  playlists: Playlist[];
  activePlaylistId: number | null;
  activePlaylistTracks: LibraryTrack[];
  loading: boolean;
  setActivePlaylist: (id: number | null) => void;
  refresh: () => Promise<void>;
  createPlaylist: (name: string) => Promise<Playlist>;
  renamePlaylist: (id: number, name: string) => Promise<void>;
  deletePlaylist: (id: number) => Promise<void>;
  addTracks: (playlistId: number, trackIds: number[]) => Promise<void>;
  removeTracks: (playlistId: number, trackIds: number[]) => Promise<void>;
  moveTrack: (playlistId: number, fromPosition: number, toPosition: number) => Promise<void>;
  exportToIpod: (playlistIds: number[]) => Promise<PlaylistExportResult>;
  // Smart playlists
  smartPlaylists: SmartPlaylist[];
  activeSmartPlaylistId: number | null;
  activeSmartPlaylistTracks: LibraryTrack[];
  setActiveSmartPlaylist: (id: number | null) => void;
  createSmartPlaylist: (
    name: string,
    rules: SmartPlaylistRuleGroup,
    sortBy?: string,
    sortDirection?: string,
    limit?: number,
  ) => Promise<SmartPlaylist>;
  updateSmartPlaylist: (
    id: number,
    name: string,
    rules: SmartPlaylistRuleGroup,
    sortBy?: string,
    sortDirection?: string,
    limit?: number,
  ) => Promise<void>;
  deleteSmartPlaylist: (id: number) => Promise<void>;
  refreshSmartPlaylists: () => Promise<void>;
}

// ── Context ─────────────────────────────────────────────────────

const PlaylistContext = createContext<PlaylistContextValue | null>(null);

export const PlaylistProvider = ({ children }: { children: React.ReactNode }) => {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<number | null>(null);
  const [activePlaylistTracks, setActivePlaylistTracks] = useState<LibraryTrack[]>([]);
  const [loading, setLoading] = useState(false);

  // Smart playlist state
  const [smartPlaylists, setSmartPlaylists] = useState<SmartPlaylist[]>([]);
  const [activeSmartPlaylistId, setActiveSmartPlaylistIdState] = useState<number | null>(null);
  const [activeSmartPlaylistTracks, setActiveSmartPlaylistTracks] = useState<LibraryTrack[]>([]);

  // ── Fetch playlists ─────────────────────────────────────────

  const refresh = useCallback(async () => {
    try {
      const result = await invoke<Playlist[]>("get_playlists");
      setPlaylists(result);
    } catch (e) {
      console.error("Failed to load playlists:", e);
    }
  }, []);

  const refreshSmartPlaylists = useCallback(async () => {
    try {
      const result = await invoke<SmartPlaylist[]>("get_smart_playlists");
      setSmartPlaylists(result);
    } catch (e) {
      console.error("Failed to load smart playlists:", e);
    }
  }, []);

  useEffect(() => {
    refresh();
    refreshSmartPlaylists();
  }, [refresh, refreshSmartPlaylists]);

  // ── Fetch active playlist tracks ────────────────────────────

  const fetchPlaylistTracks = useCallback(async (id: number) => {
    setLoading(true);
    try {
      const result = await invoke<PlaylistTrack[]>("get_playlist_tracks", { playlistId: id });
      setActivePlaylistTracks(result.map((pt) => ({ ...pt, position: undefined }) as unknown as LibraryTrack));
    } catch (e) {
      console.error("Failed to load playlist tracks:", e);
      setActivePlaylistTracks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const setActivePlaylist = useCallback(
    (id: number | null) => {
      setActivePlaylistId(id);
      if (id !== null) {
        setActiveSmartPlaylistIdState(null);
        setActiveSmartPlaylistTracks([]);
        fetchPlaylistTracks(id);
      } else {
        setActivePlaylistTracks([]);
      }
    },
    [fetchPlaylistTracks],
  );

  // ── Smart playlist track fetching ──────────────────────────

  const fetchSmartPlaylistTracks = useCallback(async (id: number) => {
    setLoading(true);
    try {
      const result = await invoke<LibraryTrack[]>("get_smart_playlist_tracks", { id });
      setActiveSmartPlaylistTracks(result);
    } catch (e) {
      console.error("Failed to load smart playlist tracks:", e);
      setActiveSmartPlaylistTracks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const setActiveSmartPlaylist = useCallback(
    (id: number | null) => {
      setActiveSmartPlaylistIdState(id);
      if (id !== null) {
        setActivePlaylistId(null);
        setActivePlaylistTracks([]);
        fetchSmartPlaylistTracks(id);
      } else {
        setActiveSmartPlaylistTracks([]);
      }
    },
    [fetchSmartPlaylistTracks],
  );

  // ── CRUD operations ─────────────────────────────────────────

  const createPlaylist = useCallback(
    async (name: string): Promise<Playlist> => {
      const playlist = await invoke<Playlist>("create_playlist", { name });
      await refresh();
      return playlist;
    },
    [refresh],
  );

  const renamePlaylist = useCallback(
    async (id: number, name: string) => {
      await invoke("rename_playlist", { id, name });
      await refresh();
    },
    [refresh],
  );

  const deletePlaylist = useCallback(
    async (id: number) => {
      await invoke("delete_playlist", { id });
      if (activePlaylistId === id) {
        setActivePlaylistId(null);
        setActivePlaylistTracks([]);
      }
      await refresh();
    },
    [refresh, activePlaylistId],
  );

  const addTracks = useCallback(
    async (playlistId: number, trackIds: number[]) => {
      await invoke("add_tracks_to_playlist", { playlistId, trackIds });
      await refresh();
      if (activePlaylistId === playlistId) {
        fetchPlaylistTracks(playlistId);
      }
    },
    [refresh, activePlaylistId, fetchPlaylistTracks],
  );

  const removeTracks = useCallback(
    async (playlistId: number, trackIds: number[]) => {
      await invoke("remove_tracks_from_playlist", { playlistId, trackIds });
      await refresh();
      if (activePlaylistId === playlistId) {
        fetchPlaylistTracks(playlistId);
      }
    },
    [refresh, activePlaylistId, fetchPlaylistTracks],
  );

  const moveTrack = useCallback(
    async (playlistId: number, fromPosition: number, toPosition: number) => {
      await invoke("move_playlist_track", { playlistId, fromPosition, toPosition });
      if (activePlaylistId === playlistId) {
        fetchPlaylistTracks(playlistId);
      }
    },
    [activePlaylistId, fetchPlaylistTracks],
  );

  const exportToIpod = useCallback(async (playlistIds: number[]): Promise<PlaylistExportResult> => {
    const dir = await pickFolder("Choose export folder");
    if (!dir) throw new Error("cancelled");

    return invoke<PlaylistExportResult>("export_playlists_to_ipod", {
      playlistIds,
      outputDir: dir,
    });
  }, []);

  // ── Smart playlist CRUD ────────────────────────────────────

  const createSmartPlaylist = useCallback(
    async (
      name: string,
      rules: SmartPlaylistRuleGroup,
      sortBy?: string,
      sortDirection?: string,
      limit?: number,
    ): Promise<SmartPlaylist> => {
      const sp = await invoke<SmartPlaylist>("create_smart_playlist", {
        name,
        rules,
        sortBy: sortBy ?? null,
        sortDirection: sortDirection ?? null,
        limit: limit ?? null,
      });
      await refreshSmartPlaylists();
      return sp;
    },
    [refreshSmartPlaylists],
  );

  const updateSmartPlaylist = useCallback(
    async (
      id: number,
      name: string,
      rules: SmartPlaylistRuleGroup,
      sortBy?: string,
      sortDirection?: string,
      limit?: number,
    ) => {
      await invoke("update_smart_playlist", {
        id,
        name,
        rules,
        sortBy: sortBy ?? null,
        sortDirection: sortDirection ?? null,
        limit: limit ?? null,
      });
      await refreshSmartPlaylists();
      if (activeSmartPlaylistId === id) {
        fetchSmartPlaylistTracks(id);
      }
    },
    [refreshSmartPlaylists, activeSmartPlaylistId, fetchSmartPlaylistTracks],
  );

  const deleteSmartPlaylist = useCallback(
    async (id: number) => {
      await invoke("delete_smart_playlist", { id });
      if (activeSmartPlaylistId === id) {
        setActiveSmartPlaylistIdState(null);
        setActiveSmartPlaylistTracks([]);
      }
      await refreshSmartPlaylists();
    },
    [refreshSmartPlaylists, activeSmartPlaylistId],
  );

  // ── Memoized value ──────────────────────────────────────────

  const value = useMemo<PlaylistContextValue>(
    () => ({
      playlists,
      activePlaylistId,
      activePlaylistTracks,
      loading,
      setActivePlaylist,
      refresh,
      createPlaylist,
      renamePlaylist,
      deletePlaylist,
      addTracks,
      removeTracks,
      moveTrack,
      exportToIpod,
      smartPlaylists,
      activeSmartPlaylistId,
      activeSmartPlaylistTracks,
      setActiveSmartPlaylist,
      createSmartPlaylist,
      updateSmartPlaylist,
      deleteSmartPlaylist,
      refreshSmartPlaylists,
    }),
    [
      playlists,
      activePlaylistId,
      activePlaylistTracks,
      loading,
      setActivePlaylist,
      refresh,
      createPlaylist,
      renamePlaylist,
      deletePlaylist,
      addTracks,
      removeTracks,
      moveTrack,
      exportToIpod,
      smartPlaylists,
      activeSmartPlaylistId,
      activeSmartPlaylistTracks,
      setActiveSmartPlaylist,
      createSmartPlaylist,
      updateSmartPlaylist,
      deleteSmartPlaylist,
      refreshSmartPlaylists,
    ],
  );

  return <PlaylistContext.Provider value={value}>{children}</PlaylistContext.Provider>;
};

export const usePlaylist = (): PlaylistContextValue => {
  const ctx = useContext(PlaylistContext);
  if (!ctx) throw new Error("usePlaylist must be used within PlaylistProvider");
  return ctx;
};
