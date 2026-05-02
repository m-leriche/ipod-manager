export interface LibraryTrack {
  id: number;
  file_path: string;
  file_name: string;
  folder_path: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  album_artist: string | null;
  sort_artist: string | null;
  sort_album_artist: string | null;
  track_number: number | null;
  track_total: number | null;
  disc_number: number | null;
  disc_total: number | null;
  year: number | null;
  genre: string | null;
  duration_secs: number;
  sample_rate: number | null;
  bitrate_kbps: number | null;
  format: string;
  file_size: number;
  created_at: number;
  play_count: number;
  flagged: boolean;
  rating: number;
}

export interface LibraryFolder {
  id: number;
  path: string;
  added_at: number;
}

export interface ArtistSummary {
  name: string;
  track_count: number;
  album_count: number;
}

export interface AlbumSummary {
  name: string;
  artist: string;
  year: number | null;
  track_count: number;
  folder_path: string;
}

export interface GenreSummary {
  name: string;
  track_count: number;
}

export interface BrowserData {
  tracks: LibraryTrack[];
  genres: GenreSummary[];
  artists: ArtistSummary[];
  albums: AlbumSummary[];
}

export interface LibraryFilter {
  artist?: string;
  album?: string;
  genre?: string;
  search?: string;
  sort_by?: string;
  sort_direction?: "asc" | "desc";
  flagged_only?: boolean;
  rating_min?: number;
  rating_max?: number;
}

export interface Playlist {
  id: number;
  name: string;
  track_count: number;
  total_duration: number;
  created_at: number;
  updated_at: number;
}

export interface PlaylistTrack {
  position: number;
  id: number;
  file_path: string;
  file_name: string;
  folder_path: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  album_artist: string | null;
  sort_artist: string | null;
  sort_album_artist: string | null;
  track_number: number | null;
  track_total: number | null;
  disc_number: number | null;
  disc_total: number | null;
  year: number | null;
  genre: string | null;
  duration_secs: number;
  sample_rate: number | null;
  bitrate_kbps: number | null;
  format: string;
  file_size: number;
  created_at: number;
  play_count: number;
  flagged: boolean;
  rating: number;
}

export interface SmartPlaylistRule {
  field: string;
  operator: string;
  value: string;
  value2?: string;
}

export interface SmartPlaylistRuleGroup {
  match: "all" | "any";
  rules: SmartPlaylistRule[];
}

export interface SmartPlaylist {
  id: number;
  name: string;
  icon: string | null;
  rules: SmartPlaylistRuleGroup;
  sort_by: string | null;
  sort_direction: string | null;
  track_limit: number | null;
  is_builtin: boolean;
  created_at: number;
  updated_at: number;
}

export interface DuplicateTrack {
  track: LibraryTrack;
  quality_score: number;
  is_recommended: boolean;
}

export interface DuplicateGroup {
  group_id: number;
  fingerprint: string;
  tracks: DuplicateTrack[];
  duration_mismatch: boolean;
}

export interface DuplicateDetectionResult {
  groups: DuplicateGroup[];
  total_duplicate_tracks: number;
  potential_space_savings: number;
}

export interface DuplicateDetectionProgress {
  phase: string;
  completed: number;
  total: number;
}

export type LibraryViewType = "tracks" | "artists" | "albums" | "genres";

export interface LibraryScanProgress {
  total: number;
  completed: number;
  current_file: string;
}

export interface ImportProgress {
  total: number;
  completed: number;
  current_file: string;
}

export interface ImportResult {
  total_files: number;
  copied: number;
  skipped: number;
  errors: string[];
}

export interface PlaylistExportResult {
  exported: number;
  total_tracks: number;
  skipped_tracks: number;
  errors: string[];
}
