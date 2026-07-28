import { describe, it, expect } from "vitest";
import {
  availableX,
  buildTransforms,
  buildItemStyle,
  coverSizePx,
  findCenteredIndex,
  interpolateConfig,
  sortAlbums,
} from "./helpers";
import { COVER_FLOW_TUNING, COVER_MAX_PX, COVER_MIN_PX, MAX_SIDE_COUNT, MIN_SIDE_COUNT } from "./constants";
import type { AlbumSummary } from "../../../types/library";

/** On-screen room per side for a 1000px-wide stage showing 300px covers. */
const ROOM = availableX(1000, 300);

const makeAlbum = (name: string, artist = "Artist"): AlbumSummary => ({
  name,
  artist,
  year: 2024,
  track_count: 10,
  folder_path: `/music/${name}`,
});

describe("coverSizePx", () => {
  it("takes a share of the stage height, clamped both ways", () => {
    expect(coverSizePx(400)).toBe(300);
    expect(coverSizePx(100)).toBe(COVER_MIN_PX);
    expect(coverSizePx(2000)).toBe(COVER_MAX_PX);
  });
});

describe("availableX", () => {
  it("reports the room per side in cover widths", () => {
    // (1000/2 - 28) / 300 = 157% of a cover width, less the outer inset
    expect(availableX(1000, 300)).toBe(137);
  });

  it("grows with the stage and shrinks with the cover", () => {
    expect(availableX(2000, 300)).toBeGreaterThan(availableX(1000, 300));
    expect(availableX(1000, 380)).toBeLessThan(availableX(1000, 300));
  });

  it("clamps to the tuned bounds and falls back when unmeasured", () => {
    expect(availableX(0, 0)).toBe(COVER_FLOW_TUNING.fallbackReachX);
    expect(availableX(200, 380)).toBe(COVER_FLOW_TUNING.minReachX);
    expect(availableX(9000, 180)).toBe(COVER_FLOW_TUNING.maxReachX);
  });
});

describe("buildTransforms", () => {
  it("returns one entry per side slot plus center and an exit slot", () => {
    expect(buildTransforms(2, ROOM)).toHaveLength(4);
    expect(buildTransforms(3, ROOM)).toHaveLength(5);
    expect(buildTransforms(10, ROOM)).toHaveLength(12);
  });

  it("keeps the center cover flat and fully opaque", () => {
    expect(buildTransforms(5, ROOM)[0]).toEqual({ x: 0, ry: 0, z: 0, scale: 1, opacity: 1 });
  });

  it("turns the first side cover and holds that angle for the stack behind it", () => {
    const configs = buildTransforms(6, ROOM);
    expect(configs[1]).toMatchObject({ x: COVER_FLOW_TUNING.firstX, scale: COVER_FLOW_TUNING.sideScale });
    for (const config of configs.slice(2)) {
      expect(config.ry).toBe(configs[1].ry);
      expect(config.scale).toBe(configs[1].scale);
    }
  });

  it("turns further inward as density grows, up to the ceiling", () => {
    const angleAt = (sideCount: number) => buildTransforms(sideCount, ROOM)[1].ry;
    expect(angleAt(MIN_SIDE_COUNT)).toBe(COVER_FLOW_TUNING.turnAngle);
    expect(angleAt(5)).toBeGreaterThan(angleAt(4));
    expect(angleAt(MAX_SIDE_COUNT)).toBeLessThanOrEqual(COVER_FLOW_TUNING.maxTurnAngle);
  });

  it("tightens the x step as density grows so the rack still fits", () => {
    const stepAt = (sideCount: number) => {
      const configs = buildTransforms(sideCount, ROOM);
      return configs[2].x - configs[1].x;
    };
    expect(stepAt(MAX_SIDE_COUNT)).toBeLessThan(stepAt(MIN_SIDE_COUNT));
    expect(stepAt(MIN_SIDE_COUNT)).toBeLessThanOrEqual(COVER_FLOW_TUNING.maxStepX);
  });

  it("places the exit slot at the available room, undoing its foreshortening", () => {
    const configs = buildTransforms(4, ROOM);
    const exit = configs[configs.length - 1];
    const foreshortened = (exit.x * 1400) / (1400 + exit.z);
    expect(foreshortened).toBeCloseTo(ROOM, 5);
  });

  it("keeps the rack inside the room at every density", () => {
    for (let sideCount = MIN_SIDE_COUNT; sideCount <= MAX_SIDE_COUNT; sideCount++) {
      for (const config of buildTransforms(sideCount, ROOM)) {
        expect((config.x * 1400) / (1400 + config.z)).toBeLessThanOrEqual(ROOM + 0.001);
      }
    }
  });

  it("steps x and z outward monotonically", () => {
    const configs = buildTransforms(10, ROOM);
    for (let i = 1; i < configs.length; i++) {
      expect(configs[i].x).toBeGreaterThan(configs[i - 1].x);
      expect(configs[i].z).toBeGreaterThan(configs[i - 1].z);
    }
  });

  it("stays opaque until the last two slots and fades the exit slot to zero", () => {
    const { sideOpacity, fadingOpacity } = COVER_FLOW_TUNING;
    const configs = buildTransforms(4, ROOM);
    expect(configs.slice(1, 4).map((c) => c.opacity)).toEqual([sideOpacity, sideOpacity, sideOpacity]);
    expect(configs[4].opacity).toBe(fadingOpacity);
    expect(configs[5].opacity).toBe(0);
  });

  it("memoizes per side count and room", () => {
    expect(buildTransforms(7, ROOM)).toBe(buildTransforms(7, ROOM));
    expect(buildTransforms(7, ROOM)).not.toBe(buildTransforms(8, ROOM));
    expect(buildTransforms(7, ROOM)).not.toBe(buildTransforms(7, ROOM + 10));
  });
});

describe("interpolateConfig", () => {
  const transforms = buildTransforms(3, ROOM);

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
  const transforms = buildTransforms(3, ROOM);

  it("mirrors the transform for negative offsets", () => {
    const left = buildItemStyle(transforms, -1);
    const right = buildItemStyle(transforms, 1);
    expect(left.transform).toContain(`translateX(-${COVER_FLOW_TUNING.firstX}%)`);
    expect(right.transform).toContain(`translateX(${COVER_FLOW_TUNING.firstX}%)`);
    expect(left.transform).toContain(`rotateY(${transforms[1].ry}deg)`);
    expect(right.transform).toContain(`rotateY(-${transforms[1].ry}deg)`);
  });

  it("applies depth before the turn so it never shoves covers sideways", () => {
    expect(buildItemStyle(transforms, 1).transform).toMatch(/translateX\([^)]+\) translateZ\([^)]+\) rotateY\(/);
  });

  it("keeps z-index positive and descending at max density", () => {
    const wide = buildTransforms(10, ROOM);
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
