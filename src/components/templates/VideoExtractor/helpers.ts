import type { EditableChapter } from "./types";
import type { Chapter } from "../YouTubeDownloader/types";

export const parseTimestamp = (ts: string): number | null => {
  const trimmed = ts.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) {
    const [m, s] = parts;
    if (m < 0 || s < 0 || s >= 60) return null;
    return m * 60 + s;
  }
  if (parts.length === 3) {
    const [h, m, s] = parts;
    if (h < 0 || m < 0 || m >= 60 || s < 0 || s >= 60) return null;
    return h * 3600 + m * 60 + s;
  }
  return null;
};

export const formatDuration = (secs: number): string => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export const buildChapters = (
  editableChapters: EditableChapter[],
  videoDuration: number,
): { chapters: Chapter[]; errors: Map<number, string> } => {
  const errors = new Map<number, string>();
  const valid: { id: number; title: string; startSecs: number }[] = [];

  for (const ch of editableChapters) {
    const secs = parseTimestamp(ch.timestamp);

    if (secs === null) {
      errors.set(ch.id, "Invalid format (use M:SS or H:MM:SS)");
      continue;
    }

    if (secs >= videoDuration) {
      errors.set(ch.id, `Exceeds video length (${formatDuration(videoDuration)})`);
      continue;
    }

    if (valid.length > 0 && secs <= valid[valid.length - 1].startSecs) {
      errors.set(ch.id, "Must be after previous chapter");
      continue;
    }

    valid.push({ id: ch.id, title: ch.title || `Chapter ${valid.length + 1}`, startSecs: secs });
  }

  if (errors.size > 0) {
    return { chapters: [], errors };
  }

  const chapters: Chapter[] = valid.map((t, i) => ({
    title: t.title,
    start_time: t.startSecs,
    end_time: i < valid.length - 1 ? valid[i + 1].startSecs : videoDuration,
  }));

  return { chapters, errors };
};

export const fileNameFromPath = (path: string): string => {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
};
