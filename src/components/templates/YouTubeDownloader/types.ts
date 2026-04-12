import type { Chapter } from "../../../types/audio";

export type { Chapter, DownloadProgress, DownloadResult, AudioFormat } from "../../../types/audio";

export interface VideoInfo {
  title: string;
  duration: string;
  uploader: string;
  chapters: Chapter[];
}

export type Phase = "idle" | "fetching" | "ready" | "downloading" | "done";
