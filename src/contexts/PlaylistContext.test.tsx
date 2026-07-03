import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";

vi.unmock("./PlaylistContext");
import { PlaylistProvider, usePlaylist } from "./PlaylistContext";
import { UndoProvider } from "./UndoContext";

const mockPlaylist = { id: 1, name: "Test", track_count: 2, total_duration: 300, created_at: 0, updated_at: 0 };
const mockTrack = {
  position: 1,
  id: 10,
  file_path: "/music/song.flac",
  file_name: "song.flac",
  folder_path: "/music",
  title: "Song",
  artist: "Artist",
  album: "Album",
  album_artist: null,
  sort_artist: null,
  sort_album_artist: null,
  track_number: 1,
  track_total: null,
  disc_number: null,
  disc_total: null,
  year: 2024,
  genre: null,
  duration_secs: 180,
  sample_rate: 44100,
  bitrate_kbps: 1411,
  format: "FLAC",
  file_size: 30000000,
  created_at: 0,
  play_count: 0,
  last_played: null,
  flagged: false,
  rating: 0,
  replay_gain_track_db: null,
  compilation: false,
  replay_gain_album_db: null,
};
const mockSmartPlaylist = {
  id: 1,
  name: "Recently Played",
  icon: null,
  rules: { match: "all" as const, rules: [{ field: "last_played", operator: "in_last", value: "7d" }] },
  sort_by: null,
  sort_direction: null,
  track_limit: null,
  is_builtin: false,
  created_at: 0,
  updated_at: 0,
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <UndoProvider>
    <PlaylistProvider>{children}</PlaylistProvider>
  </UndoProvider>
);

beforeEach(() => {
  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "get_playlists":
        return [];
      case "get_smart_playlists":
        return [];
      default:
        return undefined;
    }
  });
});

describe("PlaylistContext", () => {
  it("throws when usePlaylist is used outside provider", () => {
    expect(() => renderHook(() => usePlaylist())).toThrow("usePlaylist must be used within PlaylistProvider");
  });

  it("has correct initial state", async () => {
    const { result } = renderHook(() => usePlaylist(), { wrapper });

    // Wait for useEffect to fire (initial refresh calls)
    await act(async () => {});

    expect(result.current.playlists).toEqual([]);
    expect(result.current.activePlaylistId).toBeNull();
    expect(result.current.activePlaylistTracks).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.smartPlaylists).toEqual([]);
    expect(result.current.activeSmartPlaylistId).toBeNull();
  });

  it("refresh() calls invoke and updates playlists", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_playlists") return [mockPlaylist];
      if (cmd === "get_smart_playlists") return [];
      return undefined;
    });

    const { result } = renderHook(() => usePlaylist(), { wrapper });
    await act(async () => {});

    expect(result.current.playlists).toEqual([mockPlaylist]);
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("get_playlists");
  });

  it("createPlaylist() calls invoke, refreshes, and returns playlist", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "create_playlist") return mockPlaylist;
      if (cmd === "get_playlists") return [mockPlaylist];
      if (cmd === "get_smart_playlists") return [];
      return undefined;
    });

    const { result } = renderHook(() => usePlaylist(), { wrapper });
    await act(async () => {});

    let created: unknown;
    await act(async () => {
      created = await result.current.createPlaylist("Test");
    });

    expect(created).toEqual(mockPlaylist);
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("create_playlist", { name: "Test" });
  });

  it("deletePlaylist() clears active playlist if deleting active", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_playlists") return [mockPlaylist];
      if (cmd === "get_playlist_tracks") return [mockTrack];
      if (cmd === "get_smart_playlists") return [];
      return undefined;
    });

    const { result } = renderHook(() => usePlaylist(), { wrapper });
    await act(async () => {});

    // Set active playlist
    await act(async () => {
      result.current.setActivePlaylist(1);
    });
    expect(result.current.activePlaylistId).toBe(1);

    // Delete the active playlist
    await act(async () => {
      await result.current.deletePlaylist(1);
    });

    expect(result.current.activePlaylistId).toBeNull();
    expect(result.current.activePlaylistTracks).toEqual([]);
  });

  it("setActivePlaylist(id) fetches tracks and clears smart playlist", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_playlists") return [mockPlaylist];
      if (cmd === "get_playlist_tracks") return [mockTrack];
      if (cmd === "get_smart_playlists") return [mockSmartPlaylist];
      if (cmd === "get_smart_playlist_tracks") return [mockTrack];
      return undefined;
    });

    const { result } = renderHook(() => usePlaylist(), { wrapper });
    await act(async () => {});

    // First set a smart playlist active
    await act(async () => {
      result.current.setActiveSmartPlaylist(1);
    });
    expect(result.current.activeSmartPlaylistId).toBe(1);

    // Then set a regular playlist — should clear smart playlist
    await act(async () => {
      result.current.setActivePlaylist(1);
    });

    expect(result.current.activePlaylistId).toBe(1);
    expect(result.current.activeSmartPlaylistId).toBeNull();
    expect(result.current.activeSmartPlaylistTracks).toEqual([]);
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("get_playlist_tracks", { playlistId: 1 });
  });

  it("setActivePlaylist(null) clears tracks", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_playlists") return [mockPlaylist];
      if (cmd === "get_playlist_tracks") return [mockTrack];
      if (cmd === "get_smart_playlists") return [];
      return undefined;
    });

    const { result } = renderHook(() => usePlaylist(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.setActivePlaylist(1);
    });
    expect(result.current.activePlaylistTracks.length).toBeGreaterThan(0);

    act(() => {
      result.current.setActivePlaylist(null);
    });

    expect(result.current.activePlaylistId).toBeNull();
    expect(result.current.activePlaylistTracks).toEqual([]);
  });

  it("setActiveSmartPlaylist(id) fetches tracks and clears regular playlist", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_playlists") return [mockPlaylist];
      if (cmd === "get_playlist_tracks") return [mockTrack];
      if (cmd === "get_smart_playlists") return [mockSmartPlaylist];
      if (cmd === "get_smart_playlist_tracks") return [mockTrack];
      return undefined;
    });

    const { result } = renderHook(() => usePlaylist(), { wrapper });
    await act(async () => {});

    // Set regular playlist active first
    await act(async () => {
      result.current.setActivePlaylist(1);
    });
    expect(result.current.activePlaylistId).toBe(1);

    // Switch to smart playlist
    await act(async () => {
      result.current.setActiveSmartPlaylist(1);
    });

    expect(result.current.activeSmartPlaylistId).toBe(1);
    expect(result.current.activePlaylistId).toBeNull();
    expect(result.current.activePlaylistTracks).toEqual([]);
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("get_smart_playlist_tracks", { id: 1 });
  });

  it("addTracks() refreshes and refetches tracks when adding to active playlist", async () => {
    let tracksFetched = 0;
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_playlists") return [mockPlaylist];
      if (cmd === "get_playlist_tracks") {
        tracksFetched++;
        return [mockTrack];
      }
      if (cmd === "get_smart_playlists") return [];
      if (cmd === "add_tracks_to_playlist") return undefined;
      return undefined;
    });

    const { result } = renderHook(() => usePlaylist(), { wrapper });
    await act(async () => {});

    // Set active playlist
    await act(async () => {
      result.current.setActivePlaylist(1);
    });
    const fetchCountAfterActivate = tracksFetched;

    // Add tracks to the active playlist
    await act(async () => {
      await result.current.addTracks(1, [10, 11]);
    });

    expect(vi.mocked(invoke)).toHaveBeenCalledWith("add_tracks_to_playlist", {
      playlistId: 1,
      trackIds: [10, 11],
    });
    // Should have re-fetched tracks after adding
    expect(tracksFetched).toBeGreaterThan(fetchCountAfterActivate);
  });

  it("removeTracks() refreshes and refetches tracks when removing from active playlist", async () => {
    let tracksFetched = 0;
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_playlists") return [mockPlaylist];
      if (cmd === "get_playlist_tracks") {
        tracksFetched++;
        return [mockTrack];
      }
      if (cmd === "get_smart_playlists") return [];
      if (cmd === "remove_tracks_from_playlist") return undefined;
      return undefined;
    });

    const { result } = renderHook(() => usePlaylist(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.setActivePlaylist(1);
    });
    const fetchCountAfterActivate = tracksFetched;

    await act(async () => {
      await result.current.removeTracks(1, [10]);
    });

    expect(vi.mocked(invoke)).toHaveBeenCalledWith("remove_tracks_from_playlist", {
      playlistId: 1,
      trackIds: [10],
    });
    expect(tracksFetched).toBeGreaterThan(fetchCountAfterActivate);
  });

  it("handles invoke failures gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(invoke).mockRejectedValue(new Error("DB error"));

    const { result } = renderHook(() => usePlaylist(), { wrapper });
    await act(async () => {});

    // Should not throw — errors are caught
    expect(result.current.playlists).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith("Failed to load playlists:", expect.any(Error));

    consoleSpy.mockRestore();
  });
});
