import type { AlbumSummary } from "../../../types/library";
import type { AlbumSortMode } from "../AlbumGrid/types";
import type { TransformConfig } from "./types";

/** Covers per side of the center cover. Mirrors the `coverFlowSideCount` setting bounds. */
export const MIN_SIDE_COUNT = 2;
export const MAX_SIDE_COUNT = 10;

// Cover flow pose: the first side cover turns, the rest stack behind it at the
// same angle with a small step in x and z — the tight racks from iTunes.
const CENTER: TransformConfig = { x: 0, ry: 0, z: 0, scale: 1, opacity: 1 };
const TURN_ANGLE = 50;
const FIRST_X = 62;
const STEP_X = 17;
const FIRST_Z = 200;
const STEP_Z = 55;
const SIDE_SCALE = 0.62;

const transformCache = new Map<number, TransformConfig[]>();

/**
 * Transform configs indexed by absolute offset from center, for `sideCount`
 * covers per side plus one trailing slot that fades out as covers exit.
 */
export const buildTransforms = (sideCount: number): TransformConfig[] => {
  const cached = transformCache.get(sideCount);
  if (cached) return cached;

  const exitSlot = sideCount + 1;
  const configs: TransformConfig[] = [CENTER];
  for (let i = 1; i <= exitSlot; i++) {
    configs.push({
      x: FIRST_X + (i - 1) * STEP_X,
      ry: TURN_ANGLE,
      z: FIRST_Z + (i - 1) * STEP_Z,
      scale: SIDE_SCALE,
      opacity: i === exitSlot ? 0 : i === sideCount ? 0.45 : 0.85,
    });
  }

  transformCache.set(sideCount, configs);
  return configs;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Interpolate between transform configs for a continuous float offset. */
export const interpolateConfig = (transforms: TransformConfig[], absOffset: number): TransformConfig => {
  const maxIdx = transforms.length - 1;
  if (absOffset >= maxIdx) return transforms[maxIdx];
  const lower = Math.floor(absOffset);
  const t = absOffset - lower;
  const a = transforms[lower];
  const b = transforms[lower + 1];
  return {
    x: lerp(a.x, b.x, t),
    ry: lerp(a.ry, b.ry, t),
    z: lerp(a.z, b.z, t),
    scale: lerp(a.scale, b.scale, t),
    opacity: lerp(a.opacity, b.opacity, t),
  };
};

/** Build inline CSS for a given continuous offset from center. */
export const buildItemStyle = (transforms: TransformConfig[], offset: number) => {
  const absOffset = Math.abs(offset);
  const sign = Math.sign(offset) || 1;
  const config = interpolateConfig(transforms, absOffset);
  return {
    transform: `translateX(${sign * config.x}%) rotateY(${-sign * config.ry}deg) translateZ(${-config.z}px) scale(${config.scale})`,
    opacity: String(config.opacity),
    zIndex: String(Math.round(100 - absOffset * 4)),
  };
};

/** Apply spring-animated positions directly to DOM (bypasses React rendering). */
export const applyPositions = (stage: HTMLDivElement | null, pos: number, transforms: TransformConfig[]) => {
  if (!stage) return;
  stage.querySelectorAll<HTMLDivElement>(":scope > [data-idx]").forEach((el) => {
    const { transform, opacity, zIndex } = buildItemStyle(transforms, Number(el.dataset.idx) - pos);
    el.style.transform = transform;
    el.style.opacity = opacity;
    el.style.zIndex = zIndex;
  });
};

/** Sort key matching the backend: strip "The ", remove non-alphanumeric, lowercase. */
const sortKey = (s: string): string => {
  const trimmed = s.trim();
  const withoutThe = /^the /i.test(trimmed) ? trimmed.slice(4) : trimmed;
  return withoutThe.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
};

export const sortAlbums = (albums: AlbumSummary[], mode: AlbumSortMode): AlbumSummary[] => {
  const sorted = [...albums];
  if (mode === "artist") {
    sorted.sort((a, b) => {
      const cmp = sortKey(a.artist).localeCompare(sortKey(b.artist));
      if (cmp !== 0) return cmp;
      return sortKey(a.name).localeCompare(sortKey(b.name));
    });
  } else {
    sorted.sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name)));
  }
  return sorted;
};

export const findCenteredIndex = (
  albums: AlbumSummary[],
  selectedAlbum: string | null,
  playingAlbum: string | undefined | null,
): number => {
  if (selectedAlbum) {
    const idx = albums.findIndex((a) => a.name === selectedAlbum);
    if (idx >= 0) return idx;
  }
  if (playingAlbum) {
    const idx = albums.findIndex((a) => a.name === playingAlbum);
    if (idx >= 0) return idx;
  }
  return 0;
};
