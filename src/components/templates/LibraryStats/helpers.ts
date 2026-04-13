import type { RockboxTrack } from "../../../types/libstats";
import type { PlayDataSort } from "./types";

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export const formatDuration = (totalSeconds: number): string => {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

export const formatTrackDuration = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
};

export const formatBitrate = (kbps: number): string => `${kbps} kbps`;

export const formatPercentage = (value: number): string => `${value.toFixed(1)}%`;

export const formatNumber = (n: number): string => n.toLocaleString();

export const sortPlayData = (tracks: RockboxTrack[], sort: PlayDataSort): RockboxTrack[] => {
  const filtered = [...tracks];

  switch (sort) {
    case "most_played":
      return filtered
        .filter((t) => t.playcount > 0)
        .sort((a, b) => b.playcount - a.playcount || a.title.localeCompare(b.title));
    case "least_recent":
      return filtered
        .filter((t) => t.playcount > 0)
        .sort((a, b) => b.lastplayed_rank - a.lastplayed_rank || a.title.localeCompare(b.title));
    case "highest_rated":
      return filtered.filter((t) => t.rating > 0).sort((a, b) => b.rating - a.rating || b.playcount - a.playcount);
    case "never_played":
      return filtered
        .filter((t) => t.playcount === 0)
        .sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
  }
};
