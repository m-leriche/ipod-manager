import type { MapPoint } from "./types";
import { INTRO_DURATION_MS, INTRO_STAGGER_MS, INTRO_SWIRL } from "./constants";

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/**
 * 0..1 progress of a point's big-bang intro: each point waits out its
 * hashed stagger delay, then eases from the galaxy center to its orbit.
 */
export const introProgress = (point: MapPoint, elapsedMs: number): number => {
  const local = (elapsedMs - point.introDelay * INTRO_STAGGER_MS) / INTRO_DURATION_MS;
  if (local <= 0) return 0;
  if (local >= 1) return 1;
  return easeOutCubic(local);
};

/**
 * Animated world position: the point orbits its cluster center, and during
 * the big-bang intro it swirls in from the galaxy center as it eases out to
 * rest. Writes into `out` so per-frame rendering allocates nothing.
 */
export const pointPositionInto = (point: MapPoint, timeSec: number, intro: number, out: { x: number; y: number }) => {
  const angle = point.orbitAngle + point.orbitSpeed * timeSec;
  const x = point.clusterX + Math.cos(angle) * point.orbitRadius;
  const y = point.clusterY + Math.sin(angle) * point.orbitRadius;
  if (intro >= 1) {
    out.x = x;
    out.y = y;
    return;
  }
  const swirl = (1 - intro) * INTRO_SWIRL;
  const cos = Math.cos(swirl);
  const sin = Math.sin(swirl);
  out.x = (x * cos - y * sin) * intro;
  out.y = (x * sin + y * cos) * intro;
};

export const pointPosition = (point: MapPoint, timeSec: number, intro: number): { x: number; y: number } => {
  const out = { x: 0, y: 0 };
  pointPositionInto(point, timeSec, intro, out);
  return out;
};

/** Twinkling brightness in [0.45, 1], phase-shifted per point. */
export const twinkleAlpha = (point: MapPoint, timeSec: number): number =>
  0.725 + 0.275 * Math.sin(point.twinklePhase + point.twinkleSpeed * timeSec);
