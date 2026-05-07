export interface WatchedArtist {
  id: number;
  name: string;
  mb_artist_id: string | null;
  mb_artist_name: string | null;
  match_status: "pending" | "matched" | "ambiguous" | "manual";
  created_at: number;
  last_checked_at: number;
}

export interface DiscoveredRelease {
  id: number;
  watched_artist_id: number;
  mb_release_group_id: string;
  title: string;
  artist_name: string;
  release_type: string | null;
  first_release_date: string | null;
  discovered_at: number;
  dismissed: boolean;
  in_library: boolean;
}

export interface NewReleasesCheckProgress {
  total_artists: number;
  completed_artists: number;
  current_artist: string;
  phase: string;
}

export interface NewReleasesCheckResult {
  artists_checked: number;
  new_releases_found: number;
  failed_lookups: number;
  cancelled: boolean;
}

export interface MbArtistCandidate {
  id: string;
  name: string;
  disambiguation: string | null;
  score: number;
}
