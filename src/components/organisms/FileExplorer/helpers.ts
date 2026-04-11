import type { FileEntry } from "./types";

const AUDIO_EXT = new Set(["mp3", "flac", "aac", "m4a", "ogg", "opus", "wav", "wma", "aiff", "alac"]);

export const fmtSize = (b: number): string => {
  if (b === 0) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
};

export const fmtDate = (s: number): string => {
  if (s === 0) return "";
  const d = new Date(s * 1000);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
};

export const icon = (e: FileEntry): string => {
  if (e.is_dir) return "\ud83d\udcc1";
  const ext = e.name.split(".").pop()?.toLowerCase() ?? "";
  return AUDIO_EXT.has(ext) ? "\ud83c\udfb5" : "\ud83d\udcc4";
};
