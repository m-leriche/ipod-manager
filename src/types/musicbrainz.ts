export interface MbTrack {
  position: number;
  disc_number: number;
  title: string;
  artist: string;
  length_ms: number | null;
}

/** One physical disc of a release. */
export interface MbMedium {
  position: number;
  format: string | null;
  track_count: number;
}

export interface MbRelease {
  id: string;
  title: string;
  artist: string;
  date: string | null;
  disambiguation: string | null;
  track_count: number;
  score: number;
}

export interface MbReleaseDetail {
  release: MbRelease;
  media: MbMedium[];
  tracks: MbTrack[];
}
