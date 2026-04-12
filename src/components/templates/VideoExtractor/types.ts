export type { Chapter, DownloadProgress, DownloadResult, AudioFormat } from "../../../types/audio";

export interface VideoProbe {
  title: string;
  duration: number;
  duration_display: string;
}

export interface EditableChapter {
  id: number;
  title: string;
  timestamp: string;
}

export type Phase = "idle" | "extracting" | "done";
