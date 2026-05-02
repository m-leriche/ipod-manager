import { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { pickFolder } from "../utils/pickPath";
import type { Playlist, PlaylistTrack, LibraryTrack, PlaylistExportResult } from "../types/library";

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
}

// ── Context ─────────────────────────────────────────────────────

const PlaylistContext = createContext<PlaylistContextValue | null>(null);

export const PlaylistProvider = ({ children }: { children: React.ReactNode }) => {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<number | null>(null);
  const [activePlaylistTracks, setActivePlaylistTracks] = useState<LibraryTrack[]>([]);
  const [loading, setLoading] = useState(false);

  // ── Fetch playlists ─────────────────────────────────────────

  const refresh = useCallback(async () => {
    try {
      const result = await invoke<Playlist[]>("get_playlists");
      setPlaylists(result);
    } catch (e) {
      console.error("Failed to load playlists:", e);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
        fetchPlaylistTracks(id);
      } else {
        setActivePlaylistTracks([]);
      }
    },
    [fetchPlaylistTracks],
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
    ],
  );

  return <PlaylistContext.Provider value={value}>{children}</PlaylistContext.Provider>;
};

export const usePlaylist = (): PlaylistContextValue => {
  const ctx = useContext(PlaylistContext);
  if (!ctx) throw new Error("usePlaylist must be used within PlaylistProvider");
  return ctx;
};
