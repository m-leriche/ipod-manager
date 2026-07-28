import type { AlbumSummary } from "../../../types/library";
import type { AlbumSortMode } from "../AlbumGrid/types";
import type { TransformConfig } from "./types";
import { COVER_FLOW_TUNING as T, COVER_HEIGHT_RATIO, COVER_MAX_PX, COVER_MIN_PX, PERSPECTIVE_PX } from "./constants";
import { COVER_FLOW_SIDE_COUNTS } from "../../../utils/settings";

const CENTER: TransformConfig = { x: 0, ry: 0, z: 0, scale: 1, opacity: 1 };

/** Cover edge length for a given stage height — mirrors the CSS clamp on each cover. */
export const coverSizePx = (stageHeight: number): number =>
  Math.min(COVER_MAX_PX, Math.max(COVER_MIN_PX, stageHeight * COVER_HEIGHT_RATIO));

/**
 * Horizontal room on one side of the center cover, as a percentage of cover
 * width, measured on screen (i.e. after perspective foreshortening).
 */
export const availableX = (stageWidth: number, coverWidth: number): number => {
  if (stageWidth <= 0 || coverWidth <= 0) return T.fallbackReachX;
  const halfPx = stageWidth / 2 - T.edgeMarginPx;
  return Math.round(Math.min(T.maxReachX, Math.max(T.minReachX, (halfPx / coverWidth) * 100 - T.outerInsetX)));
};

/**
 * Transform configs indexed by absolute offset from center: `sideCount` covers
 * per side plus one trailing slot that fades out as covers exit.
 *
 * The rack turns further inward the denser it gets, which narrows each cover
 * and leaves room for the extra ones. `roomX` is the on-screen room available
 * per side; the outermost slot is placed to land right at it.
 */
export const buildTransforms = (sideCount: number, roomX: number): TransformConfig[] => {
  const exitSlot = sideCount + 1;
  const exitZ = T.firstZ + sideCount * T.stepZ;
  // Undo the foreshortening the exit slot's depth will apply, so it lands on `roomX`
  const reachX = (roomX * (PERSPECTIVE_PX + exitZ)) / PERSPECTIVE_PX;
  const stepX = Math.min(T.maxStepX, (reachX - T.firstX) / sideCount);
  const ry = Math.min(T.maxTurnAngle, T.turnAngle + (sideCount - COVER_FLOW_SIDE_COUNTS.min) * T.turnAnglePerCover);

  const configs: TransformConfig[] = [CENTER];
  for (let i = 1; i <= exitSlot; i++) {
    configs.push({
      x: T.firstX + (i - 1) * stepX,
      ry,
      z: T.firstZ + (i - 1) * T.stepZ,
      scale: T.sideScale,
      opacity: i === exitSlot ? 0 : i === sideCount ? T.fadingOpacity : T.sideOpacity,
    });
  }

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

/**
 * Build inline CSS for a given continuous offset from center. Depth is applied
 * before the turn so it only pushes covers back, never sideways — a rotated
 * translateZ would shove each cover outward and open a gap next to the center.
 */
export const buildItemStyle = (transforms: TransformConfig[], offset: number) => {
  const absOffset = Math.abs(offset);
  const sign = Math.sign(offset) || 1;
  const config = interpolateConfig(transforms, absOffset);
  return {
    transform: `translateX(${sign * config.x}%) translateZ(${-config.z}px) rotateY(${-sign * config.ry}deg) scale(${config.scale})`,
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
