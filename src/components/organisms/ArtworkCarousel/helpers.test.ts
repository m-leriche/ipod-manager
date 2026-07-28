import { describe, it, expect } from "vitest";
import { buildTransforms, interpolateConfig, buildItemStyle, sortAlbums, findCenteredIndex } from "./helpers";
import type { AlbumSummary } from "../../../types/library";

const makeAlbum = (name: string, artist = "Artist"): AlbumSummary => ({
  name,
  artist,
  year: 2024,
  track_count: 10,
  folder_path: `/music/${name}`,
});

describe("buildTransforms", () => {
  it("returns one entry per side slot plus center and an exit slot", () => {
    expect(buildTransforms(2)).toHaveLength(4);
    expect(buildTransforms(3)).toHaveLength(5);
    expect(buildTransforms(10)).toHaveLength(12);
  });

  it("keeps the center cover flat and fully opaque", () => {
    expect(buildTransforms(5)[0]).toEqual({ x: 0, ry: 0, z: 0, scale: 1, opacity: 1 });
  });

  it("turns the first side cover and holds that angle for the stack behind it", () => {
    const configs = buildTransforms(6);
    expect(configs[1]).toMatchObject({ ry: 50, scale: 0.62 });
    for (const config of configs.slice(2)) {
      expect(config.ry).toBe(configs[1].ry);
      expect(config.scale).toBe(configs[1].scale);
    }
  });

  it("steps x and z outward monotonically", () => {
    const configs = buildTransforms(10);
    for (let i = 1; i < configs.length; i++) {
      expect(configs[i].x).toBeGreaterThan(configs[i - 1].x);
      expect(configs[i].z).toBeGreaterThan(configs[i - 1].z);
    }
  });

  it("stays opaque until the last two slots and fades the exit slot to zero", () => {
    const configs = buildTransforms(4);
    expect(configs.slice(1, 4).map((c) => c.opacity)).toEqual([0.85, 0.85, 0.85]);
    expect(configs[4].opacity).toBe(0.45);
    expect(configs[5].opacity).toBe(0);
  });

  it("memoizes per side count", () => {
    expect(buildTransforms(7)).toBe(buildTransforms(7));
    expect(buildTransforms(7)).not.toBe(buildTransforms(8));
  });
});

describe("interpolateConfig", () => {
  const transforms = buildTransforms(3);

  it("returns exact configs at integer offsets", () => {
    expect(interpolateConfig(transforms, 1)).toEqual(transforms[1]);
  });

  it("lerps between adjacent configs", () => {
    const mid = interpolateConfig(transforms, 1.5);
    expect(mid.x).toBeCloseTo((transforms[1].x + transforms[2].x) / 2);
    expect(mid.opacity).toBeCloseTo((transforms[1].opacity + transforms[2].opacity) / 2);
  });

  it("clamps past the last config", () => {
    expect(interpolateConfig(transforms, 99)).toEqual(transforms[transforms.length - 1]);
  });
});

describe("buildItemStyle", () => {
  const transforms = buildTransforms(3);

  it("mirrors the transform for negative offsets", () => {
    const left = buildItemStyle(transforms, -1);
    const right = buildItemStyle(transforms, 1);
    expect(left.transform).toContain("translateX(-62%)");
    expect(right.transform).toContain("translateX(62%)");
    expect(left.transform).toContain("rotateY(50deg)");
    expect(right.transform).toContain("rotateY(-50deg)");
  });

  it("keeps z-index positive and descending at max density", () => {
    const wide = buildTransforms(10);
    const outer = Number(buildItemStyle(wide, 11).zIndex);
    expect(outer).toBeGreaterThan(0);
    expect(outer).toBeLessThan(Number(buildItemStyle(wide, 0).zIndex));
  });
});

describe("sortAlbums", () => {
  it("sorts by album name ignoring leading 'The'", () => {
    const sorted = sortAlbums([makeAlbum("The Bends"), makeAlbum("Aja"), makeAlbum("Corner")], "album");
    expect(sorted.map((a) => a.name)).toEqual(["Aja", "The Bends", "Corner"]);
  });

  it("sorts by artist then album", () => {
    const sorted = sortAlbums(
      [makeAlbum("Zebra", "Beck"), makeAlbum("Apple", "Beck"), makeAlbum("Mono", "Air")],
      "artist",
    );
    expect(sorted.map((a) => a.name)).toEqual(["Mono", "Apple", "Zebra"]);
  });
});

describe("findCenteredIndex", () => {
  const albums = [makeAlbum("Alpha"), makeAlbum("Beta"), makeAlbum("Gamma")];

  it("prefers the selected album", () => {
    expect(findCenteredIndex(albums, "Gamma", "Beta")).toBe(2);
  });

  it("falls back to the playing album, then to zero", () => {
    expect(findCenteredIndex(albums, null, "Beta")).toBe(1);
    expect(findCenteredIndex(albums, "Missing", null)).toBe(0);
  });
});
