export interface Chapter {
  title: string;
  start_time: number;
  end_time: number;
}

export interface DownloadProgress {
  phase: string;
  percent: number;
  speed: string | null;
  eta: string | null;
  title: string | null;
}

export interface DownloadResult {
  success: boolean;
  cancelled: boolean;
  file_paths: string[];
  error: string | null;
}

export type AudioFormat = "flac" | "mp3";
