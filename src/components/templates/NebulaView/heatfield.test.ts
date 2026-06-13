import { describe, it, expect } from "vitest";
import type { LibraryTrack } from "../../../types/library";
import { buildNebulaLayout } from "./helpers";
import { buildHeatField, computeContours } from "./heatfield";
import { CONTOUR_LEVELS } from "./constants";

const track = (id: number, genre: string, playCount = 0): LibraryTrack => ({
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
  play_count: playCount,
  last_played: null,
  flagged: false,
  rating: 0,
  compilation: false,
  replay_gain_track_db: null,
  replay_gain_album_db: null,
});

const layout = buildNebulaLayout([
  ...Array.from({ length: 40 }, (_, i) => track(i + 1, "Rock", 10)),
  ...Array.from({ length: 10 }, (_, i) => track(i + 100, "Jazz")),
]);

describe("buildHeatField", () => {
  it("normalizes density into [0, 1] with a peak of 1", () => {
    const field = buildHeatField(layout);
    let max = 0;
    for (const v of field.values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      max = Math.max(max, v);
    }
    expect(max).toBeCloseTo(1);
  });

  it("is hottest where the dense, heavily-played cluster sits", () => {
    const field = buildHeatField(layout);
    const rock = layout.clusters.find((c) => c.name === "Rock");
    if (!rock) throw new Error("expected a Rock cluster");
    const gx = Math.round(((rock.x / field.worldExtent + 1) / 2) * (field.gridSize - 1));
    const gy = Math.round(((rock.y / field.worldExtent + 1) / 2) * (field.gridSize - 1));
    expect(field.values[gy * field.gridSize + gx]).toBeGreaterThan(0.5);
  });

  it("is deterministic for the same layout", () => {
    expect(buildHeatField(layout)).toEqual(buildHeatField(layout));
  });
});

describe("computeContours", () => {
  it("produces one contour per configured level", () => {
    const contours = computeContours(buildHeatField(layout));
    expect(contours.map((c) => c.level)).toEqual(CONTOUR_LEVELS);
  });

  it("traces segments around the clusters at low levels", () => {
    const contours = computeContours(buildHeatField(layout));
    expect(contours[0].segments.length).toBeGreaterThan(0);
    expect(contours[0].segments.length % 4).toBe(0);
  });

  it("keeps all segment coordinates within the field extent", () => {
    const field = buildHeatField(layout);
    for (const contour of computeContours(field)) {
      for (const coord of contour.segments) {
        expect(Math.abs(coord)).toBeLessThanOrEqual(field.worldExtent);
      }
    }
  });
});
