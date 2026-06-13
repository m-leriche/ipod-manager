import { describe, it, expect } from "vitest";
import type { LibraryTrack } from "../../../types/library";
import { buildNebulaLayout, genreColors, primaryGenre } from "./helpers";
import { UNKNOWN_GENRE } from "./constants";

const track = (id: number, genre: string | null, overrides: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id,
  file_path: `/music/${id}.flac`,
  file_name: `${id}.flac`,
  folder_path: "/music",
  title: `Track ${id}`,
  artist: "Artist",
  album: "Album",
  album_artist: null,
  sort_artist: null,
  sort_album_artist: null,
  track_number: null,
  track_total: null,
  disc_number: null,
  disc_total: null,
  year: null,
  genre,
  duration_secs: 180,
  sample_rate: 44100,
  bitrate_kbps: 1000,
  format: "FLAC",
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

describe("primaryGenre", () => {
  it("returns the genre as-is for single values", () => {
    expect(primaryGenre("Rock")).toBe("Rock");
  });

  it("takes the first entry of a multi-genre value", () => {
    expect(primaryGenre("Hip Hop; Trap; Rap")).toBe("Hip Hop");
  });

  it("falls back to Unknown for null and empty values", () => {
    expect(primaryGenre(null)).toBe(UNKNOWN_GENRE);
    expect(primaryGenre("")).toBe(UNKNOWN_GENRE);
    expect(primaryGenre("  ; Rock")).toBe(UNKNOWN_GENRE);
  });
});

describe("genreColors", () => {
  it("assigns a distinct color per genre", () => {
    const colors = genreColors(["Rock", "Jazz", "Electronic"]);
    const assigned = ["Rock", "Jazz", "Electronic"].map((name) => colors.get(name));
    expect(new Set(assigned).size).toBe(3);
  });

  it("always colors Unknown gray", () => {
    const colors = genreColors(["Rock", UNKNOWN_GENRE]);
    expect(colors.get(UNKNOWN_GENRE)).toBe("hsl(0 0% 55%)");
  });
});

describe("buildNebulaLayout", () => {
  const tracks = [track(1, "Rock"), track(2, "Rock"), track(3, "Rock; Pop"), track(4, "Jazz"), track(5, null)];

  it("creates one point per track and one cluster per primary genre", () => {
    const layout = buildNebulaLayout(tracks);
    expect(layout.points).toHaveLength(5);
    expect(layout.clusters.map((c) => c.name).sort()).toEqual(["Jazz", "Rock", UNKNOWN_GENRE]);
  });

  it("keeps every point within the square half-side extent", () => {
    const layout = buildNebulaLayout(tracks);
    for (const point of layout.points) {
      expect(Math.max(Math.abs(point.x), Math.abs(point.y))).toBeLessThanOrEqual(layout.extent);
    }
  });

  it("fills the rectangle's corners rather than leaving a centred ellipse", () => {
    const many = Array.from({ length: 200 }, (_, i) => track(i + 1, `Genre ${i % 12}`));
    const { points, extent } = buildNebulaLayout(many);
    // A round blob never populates corners; the square reshape must put some
    // point well into one (both axes far from centre at once).
    const inCorner = points.some((p) => Math.abs(p.x) > 0.5 * extent && Math.abs(p.y) > 0.5 * extent);
    expect(inCorner).toBe(true);
  });

  it("is deterministic for the same input", () => {
    expect(buildNebulaLayout(tracks)).toEqual(buildNebulaLayout(tracks));
  });

  it("colors points to match their cluster", () => {
    const layout = buildNebulaLayout(tracks);
    const clusterColor = new Map(layout.clusters.map((c) => [c.name, c.color]));
    for (const point of layout.points) {
      expect(point.color).toBe(clusterColor.get(point.genre));
    }
  });
});
