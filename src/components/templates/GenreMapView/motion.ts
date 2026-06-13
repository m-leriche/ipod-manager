import type { MapPoint } from "./types";
import { GALAXY_SPIN, INTRO_DURATION_MS, INTRO_STAGGER_MS, INTRO_SWIRL } from "./constants";

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

/** Rotation of the whole galaxy around its center at time t. */
export const galaxyRotation = (timeSec: number): number => timeSec * GALAXY_SPIN;

/**
 * Animated world position: the point orbits its cluster center while the
 * whole galaxy slowly spins, and during the intro everything swirls in
 * from the center. Writes into `out` so per-frame rendering allocates
 * nothing.
 */
export const pointPositionInto = (point: MapPoint, timeSec: number, intro: number, out: { x: number; y: number }) => {
  const angle = point.orbitAngle + point.orbitSpeed * timeSec;
  const x = point.clusterX + Math.cos(angle) * point.orbitRadius;
  const y = point.clusterY + Math.sin(angle) * point.orbitRadius;
  const rotation = galaxyRotation(timeSec) + (intro < 1 ? (1 - intro) * INTRO_SWIRL : 0);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
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
