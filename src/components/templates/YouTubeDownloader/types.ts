export interface Chapter {
  title: string;
  start_time: number;
  end_time: number;
}

export interface VideoInfo {
  title: string;
  duration: string;
  uploader: string;
  chapters: Chapter[];
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

export type Phase = "idle" | "fetching" | "ready" | "downloading" | "done";
