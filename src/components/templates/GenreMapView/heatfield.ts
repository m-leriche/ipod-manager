import type { GenreMapLayout } from "./types";
import { HEAT_GRID_SIZE, HEAT_FIELD_MARGIN, CONTOUR_LEVELS } from "./constants";

export interface HeatField {
  /** Normalized density grid, row-major, values in [0, 1]. */
  values: Float32Array;
  gridSize: number;
  /** Half-width of the world region the grid spans. */
  worldExtent: number;
}

export interface ContourLevel {
  level: number;
  /** Flat [x1, y1, x2, y2, ...] line segments in world coordinates. */
  segments: number[];
}

const boxBlur = (values: Float32Array, gridSize: number, radius: number) => {
  const tmp = new Float32Array(values.length);
  const span = radius * 2 + 1;
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const cx = Math.min(Math.max(x + k, 0), gridSize - 1);
        sum += values[y * gridSize + cx];
      }
      tmp[y * gridSize + x] = sum / span;
    }
  }
  for (let x = 0; x < gridSize; x++) {
    for (let y = 0; y < gridSize; y++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const cy = Math.min(Math.max(y + k, 0), gridSize - 1);
        sum += tmp[cy * gridSize + x];
      }
      values[y * gridSize + x] = sum / span;
    }
  }
};

/**
 * Kernel-density "terrain" of the library: each track splats into a grid
 * cell weighted by its play count, then repeated box blurs approximate a
 * gaussian kernel. The result is the elevation model behind the heat
 * shading and the topographic contours.
 */
export const buildHeatField = (layout: GenreMapLayout): HeatField => {
  const gridSize = HEAT_GRID_SIZE;
  const worldExtent = layout.extent * HEAT_FIELD_MARGIN;
  const values = new Float32Array(gridSize * gridSize);

  for (const point of layout.points) {
    const gx = Math.round(((point.x / worldExtent + 1) / 2) * (gridSize - 1));
    const gy = Math.round(((point.y / worldExtent + 1) / 2) * (gridSize - 1));
    if (gx < 0 || gx >= gridSize || gy < 0 || gy >= gridSize) continue;
    values[gy * gridSize + gx] += 1 + Math.log2(1 + point.track.play_count) * 1.5;
  }

  boxBlur(values, gridSize, 2);
  boxBlur(values, gridSize, 2);
  boxBlur(values, gridSize, 2);

  let max = 0;
  for (const v of values) max = Math.max(max, v);
  if (max > 0) {
    // Tone curve lifts quieter clusters so one hot peak doesn't flatten the rest
    for (let i = 0; i < values.length; i++) values[i] = Math.pow(values[i] / max, 0.6);
  }

  return { values, gridSize, worldExtent };
};

/** Inferno-style colormap stops — the NASA infrared look. */
const INFERNO: [number, number, number, number][] = [
  [0, 0, 0, 4],
  [0.25, 66, 10, 104],
  [0.5, 147, 38, 103],
  [0.75, 221, 81, 58],
  [0.9, 252, 165, 10],
  [1, 252, 255, 164],
];

const sampleInferno = (t: number): [number, number, number] => {
  for (let i = 1; i < INFERNO.length; i++) {
    if (t <= INFERNO[i][0]) {
      const [t0, r0, g0, b0] = INFERNO[i - 1];
      const [t1, r1, g1, b1] = INFERNO[i];
      const f = (t - t0) / (t1 - t0);
      return [r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f];
    }
  }
  return [252, 255, 164];
};

/** Render the field to a small offscreen canvas; scaling it up on draw gives free smoothing. */
export const createHeatCanvas = (field: HeatField): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = field.gridSize;
  canvas.height = field.gridSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const image = ctx.createImageData(field.gridSize, field.gridSize);
  for (let i = 0; i < field.values.length; i++) {
    const t = field.values[i];
    // Skip the colormap's near-black bottom so even faint terrain glows,
    // and ramp alpha to full quickly — empty space alone stays dark
    const [r, g, b] = sampleInferno(0.18 + 0.82 * t);
    image.data[i * 4] = r;
    image.data[i * 4 + 1] = g;
    image.data[i * 4 + 2] = b;
    image.data[i * 4 + 3] = Math.round(Math.min(Math.max((t - 0.02) / 0.38, 0), 1) * 150);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
};

// Marching squares: corner bits → segment endpoints on cell edges T/R/B/L
const EDGE_TABLE: number[][][] = [
  [],
  [[3, 0]],
  [[0, 1]],
  [[3, 1]],
  [[1, 2]],
  [
    [3, 0],
    [1, 2],
  ],
  [[0, 2]],
  [[3, 2]],
  [[2, 3]],
  [[0, 2]],
  [
    [0, 1],
    [2, 3],
  ],
  [[1, 2]],
  [[1, 3]],
  [[0, 1]],
  [[3, 0]],
  [],
];

/** Topographic iso-lines of the density field, via marching squares. */
export const computeContours = (field: HeatField): ContourLevel[] => {
  const { values, gridSize, worldExtent } = field;
  const toWorld = (g: number) => ((g / (gridSize - 1)) * 2 - 1) * worldExtent;

  return CONTOUR_LEVELS.map((level) => {
    const segments: number[] = [];
    for (let y = 0; y < gridSize - 1; y++) {
      for (let x = 0; x < gridSize - 1; x++) {
        const v0 = values[y * gridSize + x];
        const v1 = values[y * gridSize + x + 1];
        const v2 = values[(y + 1) * gridSize + x + 1];
        const v3 = values[(y + 1) * gridSize + x];
        const index = (v0 > level ? 1 : 0) | (v1 > level ? 2 : 0) | (v2 > level ? 4 : 0) | (v3 > level ? 8 : 0);
        const edges = EDGE_TABLE[index];
        if (edges.length === 0) continue;

        const edgePoint = (edge: number): [number, number] => {
          switch (edge) {
            case 0:
              return [x + (level - v0) / (v1 - v0), y];
            case 1:
              return [x + 1, y + (level - v1) / (v2 - v1)];
            case 2:
              return [x + (level - v3) / (v2 - v3), y + 1];
            default:
              return [x, y + (level - v0) / (v3 - v0)];
          }
        };

        for (const [a, b] of edges) {
          const [ax, ay] = edgePoint(a);
          const [bx, by] = edgePoint(b);
          segments.push(toWorld(ax), toWorld(ay), toWorld(bx), toWorld(by));
        }
      }
    }
    return { level, segments };
  });
};
