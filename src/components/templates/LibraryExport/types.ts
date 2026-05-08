export interface ExportResult {
  path: string;
  track_count: number;
  playlist_count: number;
  smart_playlist_count: number;
  file_size: number;
}

export interface ImportResult {
  tracks_updated: number;
  tracks_skipped: number;
  playlists_imported: number;
  playlists_skipped: number;
  smart_playlists_imported: number;
  smart_playlists_skipped: number;
}

export type ExportPhase = "idle" | "exporting" | "done";
export type ImportPhase = "idle" | "importing" | "done";
