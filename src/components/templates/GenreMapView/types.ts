import type { LibraryTrack } from "../../../types/library";

export interface MapPoint {
  track: LibraryTrack;
  genre: string;
  /** Resting position at t=0 (cluster center + orbit at the base angle). */
  x: number;
  y: number;
  radius: number;
  color: string;
  clusterX: number;
  clusterY: number;
  /** Distance from the cluster center the point orbits at. */
  orbitRadius: number;
  /** Orbit angle at t=0, in radians. */
  orbitAngle: number;
  /** Signed angular velocity, radians per second. */
  orbitSpeed: number;
  twinklePhase: number;
  twinkleSpeed: number;
  /** 0..1 fraction of the intro stagger window before this point appears. */
  introDelay: number;
}

export interface GenreCluster {
  name: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  trackCount: number;
}

export interface GenreMapLayout {
  points: MapPoint[];
  clusters: GenreCluster[];
  /** Half-width of the square world region containing all clusters. */
  extent: number;
}

export interface ViewTransform {
  /** Uniform zoom factor, driven by scroll. */
  scale: number;
  /** Screen-aligned anisotropic stretch that spreads the round galaxy to
   * fill the rectangular viewport. Stays fixed while zooming/panning. */
  stretchX: number;
  stretchY: number;
  offsetX: number;
  offsetY: number;
}

export interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
}
