import { describe, it, expect } from "vitest";
import type { MapPoint } from "./types";
import { galaxyRotation, introProgress, pointPosition, twinkleAlpha } from "./motion";
import { INTRO_DURATION_MS, INTRO_STAGGER_MS } from "./constants";

const point = (overrides: Partial<MapPoint> = {}): MapPoint =>
  ({
    genre: "Rock",
    x: 110,
    y: 50,
    radius: 2,
    color: "hsl(0 85% 62%)",
    clusterX: 100,
    clusterY: 50,
    orbitRadius: 10,
    orbitAngle: 0,
    orbitSpeed: 0.1,
    twinklePhase: 0,
    twinkleSpeed: 1,
    introDelay: 0.5,
    ...overrides,
  }) as MapPoint;

describe("introProgress", () => {
  it("is 0 before the point's stagger delay has passed", () => {
    expect(introProgress(point(), 0)).toBe(0);
    expect(introProgress(point(), 0.5 * INTRO_STAGGER_MS - 1)).toBe(0);
  });

  it("is 1 once the intro duration has elapsed", () => {
    expect(introProgress(point(), 0.5 * INTRO_STAGGER_MS + INTRO_DURATION_MS)).toBe(1);
  });

  it("increases monotonically in between", () => {
    const early = introProgress(point(), 0.5 * INTRO_STAGGER_MS + 200);
    const late = introProgress(point(), 0.5 * INTRO_STAGGER_MS + 1000);
    expect(early).toBeGreaterThan(0);
    expect(late).toBeGreaterThan(early);
    expect(late).toBeLessThan(1);
  });
});

describe("pointPosition", () => {
  it("starts every point at the galaxy center", () => {
    const { x, y } = pointPosition(point(), 0, 0);
    expect(Math.hypot(x, y)).toBe(0);
  });

  it("orbits the cluster center (itself rotated by the galaxy spin) once the intro completes", () => {
    const p = point();
    const { x, y } = pointPosition(p, 5, 1);
    const rotation = galaxyRotation(5);
    const cx = p.clusterX * Math.cos(rotation) - p.clusterY * Math.sin(rotation);
    const cy = p.clusterX * Math.sin(rotation) + p.clusterY * Math.cos(rotation);
    expect(Math.hypot(x - cx, y - cy)).toBeCloseTo(p.orbitRadius);
  });

  it("matches the layout position at t=0 after the intro", () => {
    const p = point();
    expect(pointPosition(p, 0, 1)).toEqual({ x: p.x, y: p.y });
  });

  it("is deterministic for the same time", () => {
    expect(pointPosition(point(), 3.7, 0.6)).toEqual(pointPosition(point(), 3.7, 0.6));
  });
});

describe("twinkleAlpha", () => {
  it("stays within its brightness band", () => {
    for (let t = 0; t < 10; t += 0.37) {
      const alpha = twinkleAlpha(point(), t);
      expect(alpha).toBeGreaterThanOrEqual(0.45);
      expect(alpha).toBeLessThanOrEqual(1);
    }
  });
});
