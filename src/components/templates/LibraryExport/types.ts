export interface ExportResult {
  path: string;
  track_count: number;
  playlist_count: number;
  smart_playlist_count: number;
  file_size: number;
}

export type Phase = "idle" | "exporting" | "done";
