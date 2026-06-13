import type { NebulaLayout, MapPoint, Star, ViewTransform } from "./types";
import type { ContourLevel, HeatField } from "./heatfield";
import { INTRO_DURATION_MS, INTRO_STAGGER_MS, LABEL_MIN_SCREEN_RADIUS, STAR_COUNT } from "./constants";
import { easeOutCubic, introProgress, pointPositionInto, twinkleAlpha } from "./motion";

/** Seeded PRNG (mulberry32) so the starfield is stable across renders. */
const createRng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const createStarfield = (extent: number): Star[] => {
  const rng = createRng(0x5747a5);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: (rng() - 0.5) * extent * 6,
    y: (rng() - 0.5) * extent * 6,
    size: 0.5 + rng() * 1.3,
    phase: rng() * Math.PI * 2,
  }));
};

/** A star sprite: white-hot core fading through the genre color to nothing. */
const createGlowSprite = (color: string): HTMLCanvasElement => {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  // Tiny white pinpoint, then the genre hue takes over fast and carries most
  // of the glow — so dots read as their colour instead of blowing out white.
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.85)");
  gradient.addColorStop(0.1, color);
  gradient.addColorStop(0.45, color.replace(")", " / 0.4)"));
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return canvas;
};

export const createSprites = (layout: NebulaLayout): Map<string, HTMLCanvasElement> => {
  const glows = new Map<string, HTMLCanvasElement>();
  for (const cluster of layout.clusters) {
    if (!glows.has(cluster.color)) glows.set(cluster.color, createGlowSprite(cluster.color));
  }
  return glows;
};

export interface FrameParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  view: ViewTransform;
  layout: NebulaLayout;
  stars: Star[];
  glows: Map<string, HTMLCanvasElement>;
  heat: HeatField;
  heatCanvas: HTMLCanvasElement;
  contours: ContourLevel[];
  timeSec: number;
  introElapsedMs: number;
  hovered: MapPoint | null;
}

const drawBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const gradient = ctx.createRadialGradient(
    width / 2,
    height * 0.45,
    0,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.75,
  );
  gradient.addColorStop(0, "#10101f");
  gradient.addColorStop(1, "#04040a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
};

const drawStars = (params: FrameParams) => {
  const { ctx, width, height, view, stars, timeSec } = params;
  // Weaker scale/offset response than the galaxy → background parallax
  const scale = Math.pow(view.scale, 0.3);
  const offsetX = width / 2 + (view.offsetX - width / 2) * 0.25;
  const offsetY = height / 2 + (view.offsetY - height / 2) * 0.25;
  ctx.fillStyle = "#ffffff";
  for (const star of stars) {
    const sx = star.x * scale + offsetX;
    const sy = star.y * scale + offsetY;
    if (sx < 0 || sx > width || sy < 0 || sy > height) continue;
    ctx.globalAlpha = 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(star.phase + timeSec * 0.8));
    ctx.fillRect(sx, sy, star.size, star.size);
  }
  ctx.globalAlpha = 1;
};

/** Infrared-style heat shading: the density field drawn as one glowing image. */
const drawHeat = (params: FrameParams, intro: number) => {
  const { ctx, view, heat, heatCanvas, timeSec } = params;
  const half = heat.worldExtent;
  const k = view.scale * intro;
  // Ambient underglow so the genre colours stay the star of the show; slow
  // breathing keeps the terrain feeling alive rather than printed.
  ctx.globalAlpha = (0.55 + 0.1 * Math.sin(timeSec * 0.35)) * intro;
  ctx.imageSmoothingEnabled = true;
  ctx.save();
  // The screen-aligned stretch maps the square density field onto the
  // rectangular viewport, matching the per-point path at full intro.
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(view.stretchX, view.stretchY);
  ctx.scale(k, k);
  ctx.drawImage(heatCanvas, -half, -half, half * 2, half * 2);
  ctx.restore();
  ctx.globalAlpha = 1;
};

// World-space Path2D per contour level, cached so each frame is one stroke call
const contourPathCache = new WeakMap<ContourLevel[], Path2D[]>();

const contourPaths = (contours: ContourLevel[]): Path2D[] => {
  let paths = contourPathCache.get(contours);
  if (!paths) {
    paths = contours.map((contour) => {
      const path = new Path2D();
      const { segments } = contour;
      for (let s = 0; s < segments.length; s += 4) {
        path.moveTo(segments[s], segments[s + 1]);
        path.lineTo(segments[s + 2], segments[s + 3]);
      }
      return path;
    });
    contourPathCache.set(contours, paths);
  }
  return paths;
};

/** Topographic iso-lines over the heat terrain, denser levels drawn brighter. */
const drawContours = (params: FrameParams, intro: number) => {
  const { ctx, view, contours } = params;
  const k = view.scale * intro;
  if (k <= 0) return;
  const paths = contourPaths(contours);
  ctx.save();
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(view.stretchX, view.stretchY);
  ctx.scale(k, k);
  ctx.lineWidth = 1 / k;
  ctx.strokeStyle = "rgb(160 200 255)";
  paths.forEach((path, i) => {
    ctx.globalAlpha = (0.1 + i * 0.05) * intro;
    ctx.stroke(path);
  });
  ctx.restore();
  ctx.globalAlpha = 1;
};

const scratchPos = { x: 0, y: 0 };

// Cost is O(tracks) per frame: every point runs pointPositionInto + twinkle
// each tick (hitTest likewise). Fine into the low thousands; a 20k+ library
// will drop frames. If that becomes real, cap rendered points or freeze the
// orbit math when zoomed far enough out that the drift is sub-pixel.
const drawPoints = (params: FrameParams) => {
  const { ctx, width, height, view, layout, glows, timeSec, introElapsedMs, hovered } = params;
  const { scale, stretchX, stretchY, offsetX, offsetY } = view;
  for (const point of layout.points) {
    const sprite = glows.get(point.color);
    if (!sprite) continue;
    const intro = introProgress(point, introElapsedMs);
    if (intro === 0) continue;
    pointPositionInto(point, timeSec, intro, scratchPos);
    const sx = scratchPos.x * stretchX * scale + offsetX;
    const sy = scratchPos.y * stretchY * scale + offsetY;
    const isHovered = point === hovered;
    const radius = Math.max(point.radius * scale, 1.4) * (isHovered ? 1.6 : 1);
    // Cap the halo so deep zooms don't melt the GPU on fill rate
    const size = Math.min(radius * 6, 96);
    if (sx + size < 0 || sx - size > width || sy + size < 0 || sy - size > height) continue;
    ctx.globalAlpha = (isHovered ? 1 : twinkleAlpha(point, timeSec)) * intro;
    ctx.drawImage(sprite, sx - size / 2, sy - size / 2, size, size);
    if (isHovered) {
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx, sy, radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
};

const drawLabels = (params: FrameParams, intro: number) => {
  const { ctx, width, height, view, layout } = params;
  if (intro < 0.6) return;
  ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const cluster of layout.clusters) {
    if (cluster.radius * view.scale < LABEL_MIN_SCREEN_RADIUS) continue;
    const sx = cluster.x * view.stretchX * view.scale + view.offsetX;
    const sy = cluster.y * view.stretchY * view.scale + view.offsetY;
    if (sx < 0 || sx > width || sy < 0 || sy > height) continue;
    ctx.globalAlpha = (intro - 0.6) / 0.4;
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillText(cluster.name, sx + 1, sy + 1);
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.fillText(cluster.name, sx, sy);
  }
  ctx.globalAlpha = 1;
};

export const drawFrame = (params: FrameParams) => {
  const { ctx, width, height, introElapsedMs } = params;
  const intro = easeOutCubic(Math.min(introElapsedMs / (INTRO_DURATION_MS + INTRO_STAGGER_MS), 1));

  drawBackground(ctx, width, height);
  drawStars(params);
  ctx.globalCompositeOperation = "screen";
  drawHeat(params, intro);
  ctx.globalCompositeOperation = "source-over";
  drawContours(params, intro);
  ctx.globalCompositeOperation = "lighter";
  drawPoints(params);
  ctx.globalCompositeOperation = "source-over";
  drawLabels(params, intro);
};
