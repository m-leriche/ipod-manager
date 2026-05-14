export interface AlbumInfo {
  folder_path: string;
  folder_name: string;
  artist: string | null;
  album: string | null;
  track_count: number;
  has_cover_file: boolean;
  has_embedded_art: boolean;
}

export interface AlbumArtResult {
  total: number;
  fixed: number;
  already_ok: number;
  failed: number;
  cancelled: boolean;
  errors: string[];
}
