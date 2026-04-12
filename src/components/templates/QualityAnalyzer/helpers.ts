import type { AudioFileInfo } from "../../../types/quality";
import type { VerdictGroup } from "./types";

const VERDICT_ORDER: Record<string, number> = { suspect: 0, lossy: 1, lossless: 2 };
const VERDICT_LABELS: Record<string, string> = {
  suspect: "Suspect Transcode",
  lossy: "Lossy",
  lossless: "Lossless",
};

export const groupByVerdict = (files: AudioFileInfo[]): VerdictGroup[] => {
  const groups: Record<string, AudioFileInfo[]> = { suspect: [], lossy: [], lossless: [] };

  for (const file of files) {
    const key = file.verdict in groups ? file.verdict : "lossy";
    groups[key].push(file);
  }

  return Object.entries(groups)
    .filter(([, files]) => files.length > 0)
    .sort(([a], [b]) => (VERDICT_ORDER[a] ?? 9) - (VERDICT_ORDER[b] ?? 9))
    .map(([verdict, files]) => ({
      verdict: verdict as VerdictGroup["verdict"],
      label: VERDICT_LABELS[verdict] ?? verdict,
      files: files.sort((a, b) => a.file_name.localeCompare(b.file_name)),
    }));
};

export const formatBitrate = (bitrate: number | null): string => {
  if (bitrate == null) return "--";
  const kbps = Math.round(bitrate / 1000);
  return `${kbps}k`;
};

export const formatSampleRate = (rate: number): string => {
  if (rate % 1000 === 0) return `${rate / 1000}kHz`;
  return `${(rate / 1000).toFixed(1)}kHz`;
};

export const formatBitDepth = (depth: number | null): string => {
  if (depth == null) return "--";
  return `${depth}-bit`;
};

export const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export const verdictColor = (verdict: string): string => {
  switch (verdict) {
    case "lossless":
      return "text-success";
    case "suspect":
      return "text-warning";
    default:
      return "text-text-secondary";
  }
};

export const verdictBgColor = (verdict: string): string => {
  switch (verdict) {
    case "lossless":
      return "bg-success";
    case "suspect":
      return "bg-warning";
    default:
      return "bg-text-tertiary";
  }
};
