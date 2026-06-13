import type { LibraryTrack } from "../../../types/library";
import type { GenreCluster, NebulaLayout, MapPoint } from "./types";
import {
  CLUSTER_GAP,
  DISC_SPREAD,
  MIN_CLUSTER_RADIUS,
  ORBIT_BASE_SPEED,
  OUTLIER_FRACTION,
  POINT_SPACING,
  SCATTER_BLEED,
  SPIRAL_TURNS_MAX,
  SPIRAL_TURNS_MIN,
  UNKNOWN_GENRE,
} from "./constants";

/** First genre of a "; "-joined multi-genre value, or "Unknown". */
export const primaryGenre = (genre: string | null): string => {
  const first = genre?.split(";")[0]?.trim();
  return first || UNKNOWN_GENRE;
};

/** Deterministic hash of a seed to [0, 1) — keeps the layout stable across renders. */
const hashToUnit = (seed: number, stream: number): number => {
  let h = Math.imul(seed + 1, 0x9e3779b9) ^ Math.imul(stream + 1, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const stringSeed = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h, 31) + s.charCodeAt(i);
  return h | 0;
};

/** Deterministic ±1 per genre so each cluster spins its own way. */
const spinDirection = (name: string): number => ((stringSeed(name) & 1) === 0 ? 1 : -1);

/**
 * Assign a hue around the color wheel per genre, in alphabetical order so
 * related names ("Hip Hop", "Hip Hop - Trap") land on neighbouring hues.
 */
export const genreColors = (names: string[]): Map<string, string> => {
  const sorted = names.filter((n) => n !== UNKNOWN_GENRE).sort((a, b) => a.localeCompare(b));
  const colors = new Map<string, string>();
  sorted.forEach((name, i) => {
    const hue = Math.round((i / sorted.length) * 360);
    // High saturation, mid lightness → vivid, fully-colored stars rather than
    // pale ones that wash toward white when blended.
    colors.set(name, `hsl(${hue} 95% 55%)`);
  });
  colors.set(UNKNOWN_GENRE, "hsl(0 0% 55%)");
  return colors;
};

const clusterRadius = (trackCount: number): number =>
  Math.max(MIN_CLUSTER_RADIUS, POINT_SPACING * Math.sqrt(trackCount));

/**
 * Place the clusters on a Fermat (sunflower) spiral in alphabetical (= hue)
 * order: the √-distributed radius fills a disc evenly for any number of
 * genres — three or three hundred — so the mass never degenerates into a
 * thin arm, while a fixed number of turns keeps adjacent hues next to each
 * other so the rainbow still flows through one enmeshed body.
 */
const placeClusters = (
  genres: { name: string; count: number }[],
): Map<string, { x: number; y: number; radius: number }> => {
  const ordered = [...genres].sort((a, b) => a.name.localeCompare(b.name));
  const n = ordered.length;
  const radii = ordered.map((g) => clusterRadius(g.count));
  const avgRadius = radii.reduce((sum, r) => sum + r, 0) / Math.max(n, 1);
  // Disc sized so neighbouring clusters overlap into one mass regardless of n
  const discRadius = DISC_SPREAD * avgRadius * Math.sqrt(n);
  const turns = Math.min(Math.max(n / 12, SPIRAL_TURNS_MIN), SPIRAL_TURNS_MAX);
  const angleStep = (Math.PI * 2 * turns) / Math.max(n, 1);

  const positions = new Map<string, { x: number; y: number; radius: number }>();
  ordered.forEach((genre, i) => {
    const dist = discRadius * Math.sqrt((i + 0.5) / n);
    const angle = i * angleStep;
    positions.set(genre.name, { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, radius: radii[i] });
  });

  return positions;
};

/**
 * Organic scatter: most tracks fill a center-dense, anisotropically
 * stretched blob; a fringe lands in small satellite clumps keyed by album,
 * so outliers float around the mass in little constellations.
 */
const placeTracks = (tracks: LibraryTrack[], cluster: GenreCluster): MapPoint[] => {
  const spin = spinDirection(cluster.name);
  const nameSeed = stringSeed(cluster.name);
  const stretch = 0.75 + hashToUnit(nameSeed, 6) * 0.5;
  const axis = hashToUnit(nameSeed, 7) * Math.PI;
  const cosA = Math.cos(axis);
  const sinA = Math.sin(axis);

  return tracks.map((track) => {
    let dx: number;
    let dy: number;
    if (tracks.length > 24 && hashToUnit(track.id, 5) < OUTLIER_FRACTION) {
      const albumSeed = stringSeed(track.album ?? track.folder_path);
      const satAngle = hashToUnit(albumSeed, 0) * Math.PI * 2;
      const satDist = cluster.radius * (1.4 + hashToUnit(albumSeed, 1) * 1.6);
      dx = Math.cos(satAngle) * satDist + (hashToUnit(track.id, 0) - 0.5) * POINT_SPACING * 3;
      dy = Math.sin(satAngle) * satDist + (hashToUnit(track.id, 1) - 0.5) * POINT_SPACING * 3;
    } else {
      // Center-dense, but with a tail past the nominal radius into neighbours
      const r = cluster.radius * SCATTER_BLEED * Math.pow(hashToUnit(track.id, 0), 0.7);
      const theta = hashToUnit(track.id, 1) * Math.PI * 2;
      const px = Math.cos(theta) * r;
      const py = Math.sin(theta) * r;
      // Stretch along the cluster's own axis so the blob is irregular
      const ax = px * cosA + py * sinA;
      const ay = -px * sinA + py * cosA;
      dx = ax * stretch * cosA - (ay / stretch) * sinA;
      dy = ax * stretch * sinA + (ay / stretch) * cosA;
    }

    const orbitRadius = Math.hypot(dx, dy);
    const relative = Math.min(Math.max(orbitRadius / cluster.radius, 0.15), 1.6);
    return {
      track,
      genre: cluster.name,
      x: cluster.x + dx,
      y: cluster.y + dy,
      // Squared hash skews sizes small with occasional standouts
      radius: 1.5 + Math.pow(hashToUnit(track.id, 8), 2) * 3 + Math.min(track.play_count, 20) * 0.12,
      color: cluster.color,
      clusterX: cluster.x,
      clusterY: cluster.y,
      orbitRadius,
      orbitAngle: Math.atan2(dy, dx),
      orbitSpeed: spin * ORBIT_BASE_SPEED * (0.4 + 0.6 / Math.sqrt(relative)),
      twinklePhase: hashToUnit(track.id, 2) * Math.PI * 2,
      twinkleSpeed: 0.5 + hashToUnit(track.id, 3) * 1.5,
      introDelay: hashToUnit(track.id, 4),
    };
  });
};

/**
 * Radial disc→square map: scales a point outward by a factor that depends
 * only on its angle (1 on the axes, up to √2 on the diagonals), pushing a
 * round mass out to fill a square while staying connected and centre-dense.
 * The view's anisotropic stretch then maps that square onto the rectangular
 * viewport, so the galaxy fills the frame corner to corner.
 */
const squareFactor = (x: number, y: number): number => {
  const cheb = Math.max(Math.abs(x), Math.abs(y));
  if (cheb < 1e-6) return 1;
  return Math.hypot(x, y) / cheb;
};

/**
 * Reshape the round galaxy into a square. Cluster centres move outward;
 * each point keeps its orbit offset relative to its (moved) centre so the
 * animation and heat field follow the new shape.
 */
const reshapeToSquare = (clusters: GenreCluster[], points: MapPoint[]) => {
  for (const cluster of clusters) {
    const f = squareFactor(cluster.x, cluster.y);
    cluster.x *= f;
    cluster.y *= f;
  }
  for (const point of points) {
    const f = squareFactor(point.clusterX, point.clusterY);
    point.clusterX *= f;
    point.clusterY *= f;
    point.x = point.clusterX + Math.cos(point.orbitAngle) * point.orbitRadius;
    point.y = point.clusterY + Math.sin(point.orbitAngle) * point.orbitRadius;
  }
};

export const buildNebulaLayout = (tracks: LibraryTrack[]): NebulaLayout => {
  const byGenre = new Map<string, LibraryTrack[]>();
  for (const track of tracks) {
    const genre = primaryGenre(track.genre);
    const group = byGenre.get(genre);
    if (group) group.push(track);
    else byGenre.set(genre, [track]);
  }

  const names = [...byGenre.keys()];
  const colors = genreColors(names);
  const positions = placeClusters(names.map((name) => ({ name, count: byGenre.get(name)?.length ?? 0 })));

  const clusters: GenreCluster[] = [];
  const points: MapPoint[] = [];
  for (const [name, genreTracks] of byGenre) {
    const position = positions.get(name);
    if (!position) continue;
    const cluster: GenreCluster = {
      name,
      ...position,
      color: colors.get(name) ?? "hsl(0 0% 55%)",
      trackCount: genreTracks.length,
    };
    clusters.push(cluster);
    points.push(...placeTracks(genreTracks, cluster));
  }

  reshapeToSquare(clusters, points);

  // The mass now fills a square, so size the world to its half-side (the
  // largest Chebyshev distance) — fitView maps that square onto the viewport.
  const extent = points.reduce((max, p) => Math.max(max, Math.abs(p.x), Math.abs(p.y)), 0) + CLUSTER_GAP;
  return { points, clusters, extent };
};
