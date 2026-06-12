import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useLibraryData } from "./useLibraryData";
import type { LibraryTrack } from "../../../types/library";

// The global context mocks in src/test/setup.ts return a fresh object per
// call, which makes hook callbacks depending on them unstable and loops the
// refetch effect. Real providers are stable — mirror that here.
vi.mock("../../../contexts/PlaybackContext", () => {
  const stable = { playTrack: vi.fn() };
  return { usePlayback: () => stable };
});
vi.mock("../../../contexts/PlaylistContext", () => {
  const stable = {
    activePlaylistId: null,
    activePlaylistTracks: [],
    activeSmartPlaylistId: null,
    activeSmartPlaylistTracks: [],
  };
  return { usePlaylist: () => stable };
});
vi.mock("../../../contexts/ToastContext", () => {
  const stable = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), dismiss: vi.fn() };
  return { useToast: () => stable };
});

const makeTrack = (overrides: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id: 1,
  file_path: "/music/song.mp3",
  file_name: "song.mp3",
  folder_path: "/music",
  title: "Test Song",
  artist: "Test Artist",
  album: "Test Album",
  album_artist: null,
  sort_artist: null,
  sort_album_artist: null,
  track_number: 1,
  track_total: 10,
  disc_number: 1,
  disc_total: 1,
  year: 2024,
  genre: "Rock",
  duration_secs: 200,
  sample_rate: 44100,
  bitrate_kbps: 320,
  format: "MP3",
  file_size: 5000000,
  created_at: 1700000000,
  play_count: 5,
  last_played: null,
  flagged: false,
  rating: 0,
  replay_gain_track_db: null,
  compilation: false,
  replay_gain_album_db: null,
  ...overrides,
});

const PAGE_SIZE = 500;

const makePage = (offset: number, count: number): LibraryTrack[] =>
  Array.from({ length: count }, (_, i) => makeTrack({ id: offset + i, title: `Track ${offset + i}` }));

type InvokeArgs = { filter: { offset: number; limit: number } };

const mockBackend = (totalCount: number) => {
  vi.mocked(invoke).mockImplementation((cmd, args) => {
    switch (cmd) {
      case "get_library_location":
        return Promise.resolve("/music");
      case "background_rescan":
        return Promise.resolve({ changed: 0, removed: 0, total_scanned: 0 });
      case "get_library_browser_data_paginated":
        return Promise.resolve({
          tracks: { tracks: makePage(0, PAGE_SIZE), total_count: totalCount },
          genres: [],
          artists: [],
          albums: [],
        });
      case "get_library_tracks_page": {
        const { offset } = (args as InvokeArgs).filter;
        return Promise.resolve({ tracks: makePage(offset, PAGE_SIZE), total_count: 0 });
      }
      default:
        return Promise.resolve(null);
    }
  });
};

const pageCalls = () =>
  vi
    .mocked(invoke)
    .mock.calls.filter(([cmd]) => cmd === "get_library_tracks_page")
    .map(([, args]) => (args as InvokeArgs).filter.offset);

const renderLoaded = async (totalCount: number) => {
  mockBackend(totalCount);
  const hook = renderHook(() => useLibraryData());
  await waitFor(() => expect(hook.result.current.dataLoaded).toBe(true));
  await waitFor(() => expect(hook.result.current.totalTrackCount).toBe(totalCount));
  return hook;
};

describe("useLibraryData loadMoreTracks", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("fetches the page containing a far-away index directly, without intermediate pages", async () => {
    const { result } = await renderLoaded(2000);

    await act(async () => {
      await result.current.loadMoreTracks(1750);
    });

    expect(pageCalls()).toEqual([1500]);
    expect(result.current.tracks[1500]?.id).toBe(1500);
    expect(result.current.tracks[1750]?.id).toBe(1750);
    // The gap between the first page and the fetched page stays unloaded
    expect(result.current.tracks[1499]).toBeUndefined();
    // First page is untouched
    expect(result.current.tracks[0]?.id).toBe(0);
  });

  it("dedupes concurrent requests for indexes in the same page", async () => {
    const { result } = await renderLoaded(2000);

    await act(async () => {
      await Promise.all([result.current.loadMoreTracks(600), result.current.loadMoreTracks(999)]);
    });

    expect(pageCalls()).toEqual([500]);
  });

  it("re-fetches a page after a failed request", async () => {
    const { result } = await renderLoaded(2000);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(invoke).mockImplementation((cmd) =>
      cmd === "get_library_tracks_page" ? Promise.reject(new Error("boom")) : Promise.resolve(null),
    );

    await act(async () => {
      await result.current.loadMoreTracks(600);
    });
    expect(result.current.tracks[500]).toBeUndefined();

    mockBackend(2000);
    await act(async () => {
      await result.current.loadMoreTracks(600);
    });
    expect(result.current.tracks[600]?.id).toBe(600);
    consoleError.mockRestore();
  });

  it("caps the number of in-flight page requests", async () => {
    const { result } = await renderLoaded(5000);
    vi.mocked(invoke).mockImplementation((cmd) =>
      cmd === "get_library_tracks_page" ? new Promise(() => {}) : Promise.resolve(null),
    );

    act(() => {
      result.current.loadMoreTracks(500);
      result.current.loadMoreTracks(1000);
      result.current.loadMoreTracks(1500);
      result.current.loadMoreTracks(2000);
      result.current.loadMoreTracks(2500);
    });

    expect(pageCalls()).toEqual([500, 1000, 1500, 2000]);
  });

  it("ignores indexes outside the library", async () => {
    const { result } = await renderLoaded(2000);

    await act(async () => {
      await result.current.loadMoreTracks(2000);
      await result.current.loadMoreTracks(-1);
    });

    expect(pageCalls()).toEqual([]);
  });
});
