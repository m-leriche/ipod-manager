import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useGenreFetch } from "./useGenreFetch";
import type { LibraryTrack } from "../../../types/library";
import type { GenreLookupOutcome } from "./types";

const makeTrack = (overrides: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id: 1,
  file_path: "/music/a.mp3",
  file_name: "a.mp3",
  folder_path: "/music",
  title: "Song",
  artist: "Nirvana",
  album: "Nevermind",
  album_artist: null,
  sort_artist: null,
  sort_album_artist: null,
  track_number: 1,
  track_total: null,
  disc_number: null,
  disc_total: null,
  year: 1991,
  genre: "Rock",
  duration_secs: 200,
  sample_rate: 44100,
  bitrate_kbps: 320,
  format: "mp3",
  file_size: 1000,
  created_at: 0,
  play_count: 0,
  last_played: null,
  flagged: false,
  rating: 0,
  compilation: false,
  replay_gain_track_db: null,
  replay_gain_album_db: null,
  ...overrides,
});

const OUTCOME: GenreLookupOutcome = {
  results: [
    {
      artist: "Nirvana",
      album: "Nevermind",
      current_genre: "Rock",
      suggested_genres: "Grunge; Rock",
      source: "lastfm_album",
    },
  ],
  cancelled: false,
};

describe("useGenreFetch", () => {
  it("groups selected tracks into one query per album", async () => {
    vi.mocked(invoke).mockResolvedValue(OUTCOME);
    const { result } = renderHook(() => useGenreFetch(vi.fn()));

    await act(async () => {
      result.current.fetchForTracks([
        makeTrack({ id: 1, genre: "Rock" }),
        makeTrack({ id: 2 }),
        makeTrack({ id: 3, artist: "Pixies", album: "Doolittle", genre: null }),
      ]);
    });

    expect(invoke).toHaveBeenCalledWith("lookup_album_genres", {
      albums: [
        { artist: "Nirvana", album: "Nevermind", current_genre: "Rock" },
        { artist: "Pixies", album: "Doolittle", current_genre: null },
      ],
    });
    expect(result.current.genreResults).toEqual(OUTCOME);
  });

  it("prefers album_artist over artist for grouping", async () => {
    vi.mocked(invoke).mockResolvedValue(OUTCOME);
    const { result } = renderHook(() => useGenreFetch(vi.fn()));

    await act(async () => {
      result.current.fetchForTracks([
        makeTrack({ id: 1, artist: "Feature Guy", album_artist: "Main Artist" }),
        makeTrack({ id: 2, artist: "Other Guy", album_artist: "Main Artist" }),
      ]);
    });

    expect(invoke).toHaveBeenCalledWith("lookup_album_genres", {
      albums: [{ artist: "Main Artist", album: "Nevermind", current_genre: "Rock" }],
    });
  });

  it("does not invoke when no track has artist and album", async () => {
    const { result } = renderHook(() => useGenreFetch(vi.fn()));

    await act(async () => {
      result.current.fetchForTracks([makeTrack({ artist: null, album_artist: null })]);
    });

    expect(invoke).not.toHaveBeenCalled();
  });

  it("passes null albums for an entire-library fetch", async () => {
    vi.mocked(invoke).mockResolvedValue(OUTCOME);
    const { result } = renderHook(() => useGenreFetch(vi.fn()));

    await act(async () => {
      result.current.fetchForLibrary();
    });

    expect(invoke).toHaveBeenCalledWith("lookup_album_genres", { albums: null });
  });

  it("applies genres to every track of accepted albums via save_metadata", async () => {
    const albumTracks = [
      makeTrack({ id: 1, file_path: "/music/a.mp3" }),
      makeTrack({ id: 2, file_path: "/music/b.mp3" }),
      makeTrack({ id: 3, file_path: "/music/other.mp3", artist: "Someone", album: "Nevermind" }),
    ];
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_library_tracks") return Promise.resolve(albumTracks);
      if (cmd === "save_metadata")
        return Promise.resolve({
          total: 2,
          succeeded: 2,
          failed: 0,
          cancelled: false,
          errors: [],
          undo_operations: [],
        });
      return Promise.resolve();
    });
    const fetchBrowserData = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useGenreFetch(fetchBrowserData));

    await act(async () => {
      await result.current.applyResults([{ result: OUTCOME.results[0], genre: "Grunge; Rock" }]);
    });

    expect(invoke).toHaveBeenCalledWith("get_library_tracks", { filter: { album: ["Nevermind"] } });
    expect(invoke).toHaveBeenCalledWith("save_metadata", {
      updates: [
        { file_path: "/music/a.mp3", genre: "Grunge; Rock" },
        { file_path: "/music/b.mp3", genre: "Grunge; Rock" },
      ],
    });
    expect(fetchBrowserData).toHaveBeenCalled();
  });

  it("does nothing when applying an empty acceptance list", async () => {
    const { result } = renderHook(() => useGenreFetch(vi.fn()));

    await act(async () => {
      await result.current.applyResults([]);
    });

    expect(invoke).not.toHaveBeenCalled();
  });
});
