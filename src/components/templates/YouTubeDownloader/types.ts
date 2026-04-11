export interface VideoInfo {
  title: string;
  duration: string;
  uploader: string;
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
  file_path: string | null;
  error: string | null;
}

export type AudioFormat = "flac" | "mp3";

export type Phase = "idle" | "fetching" | "ready" | "downloading" | "done";
