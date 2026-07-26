import { describe, it, expect } from "vitest";
import { savedRowLeavesViewStale } from "./helpers";
import type { LibraryTrack } from "../../../types/library";

const makeTrack = (overrides: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id: 1,
  file_path: "/music/song.mp3",
  file_name: "song.mp3",
  folder_path: "/music",
  title: "Song",
  artist: "Artist",
  album: "Album",
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
  play_count: 0,
  last_played: null,
  flagged: false,
  rating: 0,
  replay_gain_track_db: null,
  compilation: false,
  replay_gain_album_db: null,
  ...overrides,
});

describe("savedRowLeavesViewStale", () => {
  const prev = makeTrack();

  it("is false when nothing the view depends on changed", () => {
    const next = makeTrack({ rating: 5, play_count: 3 });
    expect(savedRowLeavesViewStale(prev, next, { filtered: false, sortBy: "date_added" })).toBe(false);
  });

  it("is true when a filtered view's row stops matching", () => {
    // Filtered to genre Rock, edited to Jazz: the row no longer belongs, and the
    // total count is stale too.
    const next = makeTrack({ genre: "Jazz" });
    expect(savedRowLeavesViewStale(prev, next, { filtered: true, sortBy: "date_added" })).toBe(true);
  });

  it("is false for the same edit when no filter is active", () => {
    const next = makeTrack({ genre: "Jazz" });
    expect(savedRowLeavesViewStale(prev, next, { filtered: false, sortBy: "date_added" })).toBe(false);
  });

  it("is true when the active sort field changed", () => {
    const next = makeTrack({ title: "Zzz" });
    expect(savedRowLeavesViewStale(prev, next, { filtered: false, sortBy: "title" })).toBe(true);
  });

  it("is false when a different field changed than the one sorted on", () => {
    const next = makeTrack({ genre: "Jazz" });
    expect(savedRowLeavesViewStale(prev, next, { filtered: false, sortBy: "title" })).toBe(false);
  });

  /** Artist ordering resolves through the album-artist and sort-artist overrides,
      so editing any of them can reorder an artist-sorted view. */
  it("treats the album-artist and sort-artist overrides as part of artist ordering", () => {
    for (const field of ["artist", "album_artist", "sort_artist", "sort_album_artist"] as const) {
      const next = makeTrack({ [field]: "Changed" });
      expect(savedRowLeavesViewStale(prev, next, { filtered: false, sortBy: "artist" })).toBe(true);
    }
  });

  /** Title ordering falls back to the file name, which reorganizing renames. */
  it("counts a file rename as affecting title ordering", () => {
    const next = makeTrack({ file_name: "01-02 Song.mp3" });
    expect(savedRowLeavesViewStale(prev, next, { filtered: false, sortBy: "title" })).toBe(true);
  });

  it("ignores an unknown sort mode rather than forcing a refetch", () => {
    const next = makeTrack({ title: "Zzz" });
    expect(savedRowLeavesViewStale(prev, next, { filtered: false, sortBy: "nonsense" })).toBe(false);
  });
});
