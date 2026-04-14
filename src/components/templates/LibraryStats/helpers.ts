import type { FileDetail, RockboxTrack } from "../../../types/libstats";
import type { DetailSortDir, DetailSortKey, PlayDataSort, StatsFilter } from "./types";

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

export const filterFileDetails = (files: FileDetail[], filter: StatsFilter): FileDetail[] => {
  switch (filter.category) {
    case "format":
      return files.filter((f) => f.format === filter.value);
    case "genre":
      return files.filter((f) => f.genre === filter.value);
    case "sample_rate":
      return files.filter((f) => f.sample_rate_display === filter.value);
    case "year":
      return files.filter((f) => f.year !== null && String(f.year) === filter.value);
  }
};

export const sortFileDetails = (files: FileDetail[], key: DetailSortKey, dir: DetailSortDir): FileDetail[] => {
  const sorted = [...files];
  const m = dir === "asc" ? 1 : -1;
  sorted.sort((a, b) => {
    switch (key) {
      case "path":
        return m * a.relative_path.localeCompare(b.relative_path);
      case "artist":
        return m * a.artist.localeCompare(b.artist);
      case "album":
        return m * a.album.localeCompare(b.album);
      case "title":
        return m * a.title.localeCompare(b.title);
      case "size":
        return m * (a.size - b.size);
    }
  });
  return sorted;
};

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
