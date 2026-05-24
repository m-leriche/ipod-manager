import type { DiscoveredRelease } from "../../../types/releases";
import type { ArtistGroup } from "./types";

export const groupReleasesByArtist = (releases: DiscoveredRelease[]): ArtistGroup[] => {
  const map = new Map<string, DiscoveredRelease[]>();
  for (const r of releases) {
    const existing = map.get(r.artist_name) ?? [];
    existing.push(r);
    map.set(r.artist_name, existing);
  }

  return Array.from(map.entries())
    .map(([artistName, releases]) => ({
      artistName,
      releases: releases.sort((a, b) => {
        // Sort by date descending, undated last
        if (!a.first_release_date && !b.first_release_date) return 0;
        if (!a.first_release_date) return 1;
        if (!b.first_release_date) return -1;
        return b.first_release_date.localeCompare(a.first_release_date);
      }),
    }))
    .sort((a, b) => a.artistName.localeCompare(b.artistName));
};

export const formatReleaseDate = (date: string | null): string => {
  if (!date) return "Unknown date";

  const parts = date.split("-");
  if (parts.length === 1) return parts[0]; // "2025"

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[parseInt(parts[1], 10) - 1] ?? parts[1];

  if (parts.length === 2) return `${month} ${parts[0]}`; // "Mar 2025"
  return `${month} ${parseInt(parts[2], 10)}, ${parts[0]}`; // "Mar 15, 2025"
};

export const releaseTypeBadgeClasses = (type: string | null): string => {
  switch (type) {
    case "Album":
      return "bg-accent/15 text-accent";
    case "EP":
      return "bg-green-500/15 text-green-400";
    default:
      return "bg-text-tertiary/15 text-text-tertiary";
  }
};
