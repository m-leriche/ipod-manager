import type { DiscoveredRelease } from "../../../types/releases";
import type { ArtistGroup } from "./types";

export const groupReleasesByArtist = (releases: DiscoveredRelease[]): ArtistGroup[] => {
  const map = new Map<string, ArtistGroup>();

  for (const r of releases) {
    const key = r.artist_name;
    if (!map.has(key)) {
      map.set(key, { artistName: key, releases: [] });
    }
    map.get(key)!.releases.push({
      id: r.id,
      title: r.title,
      releaseType: r.release_type,
      releaseDate: r.first_release_date,
      inLibrary: r.in_library,
      mbReleaseGroupId: r.mb_release_group_id,
    });
  }

  // Sort groups by artist name
  const groups = Array.from(map.values());
  groups.sort((a, b) => a.artistName.localeCompare(b.artistName));

  // Sort releases within each group by date descending
  for (const group of groups) {
    group.releases.sort((a, b) => {
      if (!a.releaseDate && !b.releaseDate) return 0;
      if (!a.releaseDate) return 1;
      if (!b.releaseDate) return -1;
      return b.releaseDate.localeCompare(a.releaseDate);
    });
  }

  return groups;
};

export const formatReleaseDate = (date: string | null): string => {
  if (!date) return "Unknown date";
  // MB dates can be "2025", "2025-03", or "2025-03-15"
  const parts = date.split("-");
  if (parts.length === 1) return parts[0];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[parseInt(parts[1], 10) - 1] || parts[1];
  if (parts.length === 2) return `${month} ${parts[0]}`;
  return `${month} ${parseInt(parts[2], 10)}, ${parts[0]}`;
};

export const releaseTypeBadgeColor = (type: string | null): string => {
  switch (type) {
    case "Album":
      return "bg-accent/20 text-accent";
    case "EP":
      return "bg-green-500/20 text-green-400";
    case "Single":
      return "bg-purple-500/20 text-purple-400";
    default:
      return "bg-text-tertiary/20 text-text-tertiary";
  }
};
