import type { LibraryTrack } from "../../../types/library";
import type { GenreCluster, GenreMapLayout, MapPoint } from "./types";
import {
  CLUSTER_GAP,
  CLUSTER_OVERLAP,
  MIN_CLUSTER_RADIUS,
  ORBIT_BASE_SPEED,
  OUTLIER_FRACTION,
  POINT_SPACING,
  SCATTER_BLEED,
  SPIRAL_TIGHTNESS,
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
    colors.set(name, `hsl(${hue} 85% 62%)`);
  });
  colors.set(UNKNOWN_GENRE, "hsl(0 0% 55%)");
  return colors;
};

const clusterRadius = (trackCount: number): number =>
  Math.max(MIN_CLUSTER_RADIUS, POINT_SPACING * Math.sqrt(trackCount));

/**
 * Wind the clusters along one continuous spiral in alphabetical (= hue)
 * order, each center placed inside its neighbour's radius. Adjacent hues
 * sit side by side and overlap, so the colors flow through one
 * intertwined mass instead of separated discs.
 */
const placeClusters = (
  genres: { name: string; count: number }[],
): Map<string, { x: number; y: number; radius: number }> => {
  const ordered = [...genres].sort((a, b) => a.name.localeCompare(b.name));
  const positions = new Map<string, { x: number; y: number; radius: number }>();

  let angle = 0;
  let dist = 0;
  let prevRadius = 0;
  ordered.forEach((genre, i) => {
    const radius = clusterRadius(genre.count);
    if (i > 0) {
      const step = (prevRadius + radius) * CLUSTER_OVERLAP;
      dist = Math.max(dist, step);
      angle += step / dist;
      dist += step * SPIRAL_TIGHTNESS;
    }
    positions.set(genre.name, { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, radius });
    prevRadius = radius;
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

export const buildGenreMapLayout = (tracks: LibraryTrack[]): GenreMapLayout => {
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

  // Satellites reach past their cluster radius, so size the world to the points
  const extent = points.reduce((max, p) => Math.max(max, Math.hypot(p.x, p.y)), 0) + CLUSTER_GAP;
  return { points, clusters, extent };
};
