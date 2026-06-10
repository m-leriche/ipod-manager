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
  disc_number: number | null;
  disc_total: number | null;
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
  disc_number?: number;
  disc_total?: number;
  year?: number;
  genre?: string;
  compilation?: boolean;
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
  undo_operations: MetadataUpdate[];
}

/** A named set of field values that can be applied to many tracks at once. */
export interface MetadataTemplate {
  id: string;
  name: string;
  /** Field name → value (string-encoded, matching the editor's EditableFields). */
  fields: Record<string, string>;
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
