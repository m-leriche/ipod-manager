export interface AlbumInfo {
  folder_path: string;
  folder_name: string;
  artist: string | null;
  album: string | null;
  track_count: number;
  has_cover_file: boolean;
  has_embedded_art: boolean;
}

export interface AlbumArtProgress {
  total: number;
  completed: number;
  current_album: string;
  phase: string;
}

export interface ScanProgress {
  albums_found: number;
  current_folder: string;
}

export interface AlbumArtResult {
  total: number;
  fixed: number;
  already_ok: number;
  failed: number;
  cancelled: boolean;
  errors: string[];
}

export type Phase = "idle" | "scanning" | "scanned" | "fixing";
