import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useLibraryData } from "./useLibraryData";
import type { LibraryTrack, TracksUpdated } from "../../../types/library";

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

/** Comfortably past the hook's post-save reconcile debounce. */
const SYNC_SETTLE_MS = 600;

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
      case "get_library_aggregates":
        return Promise.resolve({
          genres: [{ name: "Jazz", track_count: 1 }],
          artists: [{ name: "Corrected Artist", track_count: 1, album_count: 1 }],
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

describe("useLibraryData track updates", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(listen).mockReset();
    vi.mocked(listen).mockImplementation(() => Promise.resolve(() => {}));
  });

  /** Capture the handler the hook registers for a given event. */
  const handlerFor = (event: string) => {
    const call = vi.mocked(listen).mock.calls.find(([name]) => name === event);
    if (!call) throw new Error(`no listener registered for ${event}`);
    return call[1] as (e: { payload: TracksUpdated }) => void;
  };

  const emit = async (payload: TracksUpdated) => {
    await act(async () => {
      handlerFor("library-tracks-updated")({ payload });
    });
  };

  it("patches the edited row in place instead of refetching the browser", async () => {
    const { result } = await renderLoaded(2000);
    const before = vi.mocked(invoke).mock.calls.length;

    await emit({
      tracks: [makeTrack({ id: 3, artist: "Corrected Artist", title: "Track 3" })],
      aggregates_stale: false,
    });

    expect(result.current.tracks[3]?.artist).toBe("Corrected Artist");
    // Neighbours untouched, and nothing was re-queried.
    expect(result.current.tracks[4]?.artist).toBe("Test Artist");
    expect(vi.mocked(invoke).mock.calls.length).toBe(before);
  });

  /** A save can move the file, so rows are matched by id — the path that comes
      back is the new one and must replace what was there. */
  it("matches rows by id so a moved file updates its path", async () => {
    const { result } = await renderLoaded(2000);

    await emit({
      tracks: [makeTrack({ id: 7, file_path: "/music/New Artist/New Album/song.flac" })],
      aggregates_stale: false,
    });

    expect(result.current.tracks[7]?.file_path).toBe("/music/New Artist/New Album/song.flac");
  });

  it("ignores rows that are not currently loaded", async () => {
    const { result } = await renderLoaded(2000);
    const before = result.current.tracks[0];

    await emit({ tracks: [makeTrack({ id: 99999 })], aggregates_stale: false });

    expect(result.current.tracks[0]).toBe(before);
  });

  it("refreshes only the aggregates when a grouping field changed", async () => {
    const { result } = await renderLoaded(2000);
    vi.mocked(invoke).mockClear();

    await emit({ tracks: [makeTrack({ id: 2, genre: "Jazz" })], aggregates_stale: true });

    await waitFor(() => expect(vi.mocked(invoke).mock.calls.map(([cmd]) => cmd)).toContain("get_library_aggregates"));
    const commands = vi.mocked(invoke).mock.calls.map(([cmd]) => cmd);
    // The whole point: no track page and no full browser refetch.
    expect(commands).not.toContain("get_library_browser_data_paginated");
    expect(commands).not.toContain("get_library_tracks_page");
    expect(result.current.tracks[2]?.genre).toBe("Jazz");
    // The sidebar lists come from the aggregates query, not from a full refetch.
    await waitFor(() => expect(result.current.genreList).toEqual([{ name: "Jazz", track_count: 1 }]));
  });

  it("does not query aggregates for a row-only change", async () => {
    await renderLoaded(2000);
    vi.mocked(invoke).mockClear();

    await emit({ tracks: [makeTrack({ id: 1, title: "Renamed" })], aggregates_stale: false });
    await new Promise((r) => setTimeout(r, SYNC_SETTLE_MS));

    expect(vi.mocked(invoke).mock.calls.map(([cmd]) => cmd)).not.toContain("get_library_aggregates");
  });

  it("coalesces a burst of saves into one aggregates query", async () => {
    await renderLoaded(2000);
    vi.mocked(invoke).mockClear();

    for (const id of [1, 2, 3, 4]) {
      await emit({ tracks: [makeTrack({ id, genre: "Jazz" })], aggregates_stale: true });
    }
    await new Promise((r) => setTimeout(r, SYNC_SETTLE_MS));

    const aggregateCalls = vi.mocked(invoke).mock.calls.filter(([cmd]) => cmd === "get_library_aggregates");
    expect(aggregateCalls).toHaveLength(1);
  });
});

describe("useLibraryData post-save reconciliation", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(listen).mockReset();
    vi.mocked(listen).mockImplementation(() => Promise.resolve(() => {}));
  });

  const handlerFor = (event: string) => {
    const call = vi.mocked(listen).mock.calls.find(([name]) => name === event);
    if (!call) throw new Error(`no listener registered for ${event}`);
    return call[1] as (e: { payload: TracksUpdated }) => void;
  };

  const emit = async (payload: TracksUpdated) => {
    await act(async () => {
      handlerFor("library-tracks-updated")({ payload });
    });
  };

  const commandsUsed = () => vi.mocked(invoke).mock.calls.map(([cmd]) => cmd);

  /** An artist/album edit both marks the aggregates stale *and* moves the file,
      so the background reorganize emits a second event with aggregates_stale
      false — inside the debounce window. Reading only the latest call's flag
      cancelled the refresh the first event asked for, and the sidebar kept
      showing the old name indefinitely. */
  it("still refreshes aggregates when a later event in the window is not stale", async () => {
    await renderLoaded(2000);
    vi.mocked(invoke).mockClear();

    // The save, then the reorganize follow-up landing before the debounce fires.
    await emit({ tracks: [makeTrack({ id: 1, artist: "Corrected" })], aggregates_stale: true });
    await emit({
      tracks: [makeTrack({ id: 1, artist: "Corrected", file_path: "/music/Corrected/a.flac" })],
      aggregates_stale: false,
    });

    await waitFor(() => expect(commandsUsed()).toContain("get_library_aggregates"));
  });

  it("applies the moved path from the reorganize follow-up event", async () => {
    const { result } = await renderLoaded(2000);

    await emit({ tracks: [makeTrack({ id: 5, artist: "Corrected" })], aggregates_stale: true });
    await emit({
      tracks: [makeTrack({ id: 5, artist: "Corrected", file_path: "/music/Corrected/b.flac" })],
      aggregates_stale: false,
    });

    expect(result.current.tracks[5]?.file_path).toBe("/music/Corrected/b.flac");
  });

  /** Sorted by title, a retitled row belongs somewhere else — and its new home
      can be outside the loaded page, so the order can't be fixed locally. */
  it("refetches the track page when the edit changes the active sort field", async () => {
    const { result } = await renderLoaded(2000);
    act(() => result.current.handleSort("title"));
    await waitFor(() => expect(result.current.sortBy).toBe("title"));
    vi.mocked(invoke).mockClear();

    await emit({ tracks: [makeTrack({ id: 1, title: "Zzz Renamed" })], aggregates_stale: false });

    await waitFor(() => expect(commandsUsed()).toContain("get_library_tracks_page"));
  });

  /** An edit to a field the view neither filters nor sorts on leaves the row
      exactly where it is — no refetch, which is the whole point. */
  it("does not refetch the page for an edit the view does not depend on", async () => {
    const { result } = await renderLoaded(2000);
    act(() => result.current.handleSort("date_added"));
    await waitFor(() => expect(result.current.sortBy).toBe("date_added"));
    vi.mocked(invoke).mockClear();

    await emit({ tracks: [makeTrack({ id: 1, genre: "Jazz" })], aggregates_stale: true });
    await new Promise((r) => setTimeout(r, SYNC_SETTLE_MS));

    expect(commandsUsed()).toContain("get_library_aggregates");
    expect(commandsUsed()).not.toContain("get_library_tracks_page");
  });
});
