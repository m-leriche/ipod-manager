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
  year: number | null;
  genre: string | null;
  duration_secs: number;
  sample_rate: number | null;
  bitrate_kbps: number | null;
  format: string;
  file_size: number;
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
