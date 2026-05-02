import { describe, it, expect } from "vitest";
import { formatDuration, formatSize, trackToEditable, computeBatchFields, buildMetadataUpdates } from "./helpers";
import type { LibraryTrack } from "../../../types/library";

const makeTrack = (overrides: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id: 1,
  file_path: "/music/Artist/Album/track.mp3",
  file_name: "track.mp3",
  folder_path: "/music/Artist/Album",
  title: "Test Song",
  artist: "Test Artist",
  album: "Test Album",
  album_artist: "Test Artist",
  sort_artist: null,
  sort_album_artist: null,
  track_number: 1,
  track_total: 10,
  disc_number: 1,
  disc_total: 2,
  year: 2023,
  genre: "Rock",
  duration_secs: 240,
  sample_rate: 44100,
  bitrate_kbps: 320,
  format: "MP3",
  file_size: 5000000,
  created_at: 1700000000,
  play_count: 0,
  flagged: false,
  rating: 0,
  ...overrides,
});

describe("formatDuration", () => {
  it("formats seconds to M:SS", () => {
    expect(formatDuration(240)).toBe("4:00");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(0)).toBe("0:00");
  });

  it("returns dash for invalid values", () => {
    expect(formatDuration(-1)).toBe("—");
    expect(formatDuration(Infinity)).toBe("—");
  });
});

describe("formatSize", () => {
  it("formats bytes to human readable", () => {
    expect(formatSize(500)).toBe("500 B");
    expect(formatSize(1536)).toBe("1.5 KB");
    expect(formatSize(5242880)).toBe("5.0 MB");
  });
});

describe("trackToEditable", () => {
  it("converts all fields to strings", () => {
    const track = makeTrack();
    const result = trackToEditable(track);
    expect(result.title).toBe("Test Song");
    expect(result.artist).toBe("Test Artist");
    expect(result.year).toBe("2023");
    expect(result.track_number).toBe("1");
    expect(result.disc_number).toBe("1");
    expect(result.disc_total).toBe("2");
  });

  it("converts null fields to empty strings", () => {
    const track = makeTrack({ title: null, year: null, disc_total: null });
    const result = trackToEditable(track);
    expect(result.title).toBe("");
    expect(result.year).toBe("");
    expect(result.disc_total).toBe("");
  });
});

describe("computeBatchFields", () => {
  it("returns single track fields with no mixed flags", () => {
    const { fields, mixed } = computeBatchFields([makeTrack()]);
    expect(fields.artist).toBe("Test Artist");
    expect(mixed.artist).toBe(false);
  });

  it("flags mixed fields and clears their values", () => {
    const tracks = [
      makeTrack({ artist: "Artist A", album: "Same Album" }),
      makeTrack({ id: 2, artist: "Artist B", album: "Same Album" }),
    ];
    const { fields, mixed } = computeBatchFields(tracks);
    expect(mixed.artist).toBe(true);
    expect(fields.artist).toBe("");
    expect(mixed.album).toBe(false);
    expect(fields.album).toBe("Same Album");
  });

  it("handles empty array", () => {
    const { fields, mixed } = computeBatchFields([]);
    expect(fields.title).toBe("");
    expect(mixed.title).toBe(false);
  });
});

describe("buildMetadataUpdates", () => {
  it("returns empty for no changes", () => {
    const track = makeTrack();
    const fields = trackToEditable(track);
    const mixed = Object.fromEntries(Object.keys(fields).map((k) => [k, false])) as Record<string, boolean>;
    const updates = buildMetadataUpdates([track], fields, fields, mixed as never);
    expect(updates).toHaveLength(0);
  });

  it("returns updates for changed fields only", () => {
    const track = makeTrack();
    const original = trackToEditable(track);
    const edited = { ...original, artist: "New Artist" };
    const mixed = Object.fromEntries(Object.keys(original).map((k) => [k, false])) as Record<string, boolean>;
    const updates = buildMetadataUpdates([track], edited, original, mixed as never);
    expect(updates).toHaveLength(1);
    expect(updates[0].artist).toBe("New Artist");
    expect(updates[0].title).toBeUndefined();
  });

  it("maps track_number to track in MetadataUpdate", () => {
    const track = makeTrack();
    const original = trackToEditable(track);
    const edited = { ...original, track_number: "5" };
    const mixed = Object.fromEntries(Object.keys(original).map((k) => [k, false])) as Record<string, boolean>;
    const updates = buildMetadataUpdates([track], edited, original, mixed as never);
    expect(updates[0].track).toBe(5);
  });

  it("handles empty string for number fields", () => {
    const track = makeTrack();
    const original = trackToEditable(track);
    const edited = { ...original, year: "" };
    const mixed = Object.fromEntries(Object.keys(original).map((k) => [k, false])) as Record<string, boolean>;
    const updates = buildMetadataUpdates([track], edited, original, mixed as never);
    expect(updates[0].year).toBeUndefined();
  });

  it("includes mixed fields when user typed a value", () => {
    const tracks = [
      makeTrack({ artist: "Artist A" }),
      makeTrack({ id: 2, artist: "Artist B", file_path: "/music/b.mp3" }),
    ];
    const original = { ...trackToEditable(tracks[0]), artist: "" };
    const mixed = Object.fromEntries(Object.keys(original).map((k) => [k, false])) as Record<string, boolean>;
    (mixed as Record<string, boolean>).artist = true;
    const edited = { ...original, artist: "Unified Artist" };
    const updates = buildMetadataUpdates(tracks, edited, original, mixed as never);
    expect(updates).toHaveLength(2);
    expect(updates[0].artist).toBe("Unified Artist");
    expect(updates[1].artist).toBe("Unified Artist");
  });
});
