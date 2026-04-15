export interface TrackMetadata {
  file_path: string;
  file_name: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  album_artist: string | null;
  sort_artist: string | null;
  sort_album_artist: string | null;
  track: number | null;
  track_total: number | null;
  year: number | null;
  genre: string | null;
}

export interface MetadataUpdate {
  file_path: string;
  title?: string;
  artist?: string;
  album?: string;
  album_artist?: string;
  sort_artist?: string;
  sort_album_artist?: string;
  track?: number;
  track_total?: number;
  year?: number;
  genre?: string;
}

export interface MetadataScanProgress {
  total: number;
  completed: number;
  current_file: string;
}

export interface MetadataSaveProgress {
  total: number;
  completed: number;
  current_file: string;
}

export interface MetadataSaveResult {
  total: number;
  succeeded: number;
  failed: number;
  cancelled: boolean;
  errors: string[];
}

export interface SanitizeProgress {
  total: number;
  completed: number;
  current_file: string;
}

export interface SanitizeResult {
  total: number;
  succeeded: number;
  failed: number;
  cancelled: boolean;
  errors: string[];
}
