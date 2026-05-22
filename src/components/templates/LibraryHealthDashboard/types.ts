export interface HealthIssue {
  id: string;
  label: string;
  count: number;
}

export interface HealthReport {
  total_tracks: number;
  issues: HealthIssue[];
}

export type Phase = "idle" | "loading" | "loaded";

export interface AlbumYearQuery {
  artist: string;
  album: string;
}

export interface AlbumYearResult {
  artist: string;
  album: string;
  suggested_year: number | null;
  release_title: string | null;
}
