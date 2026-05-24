import type { DiscoveredRelease } from "../../../types/releases";
import type { ReleaseSort, SortDir } from "./types";

export const formatReleaseDate = (date: string | null): string => {
  if (!date) return "\u2014";
  const parts = date.split("-");
  if (parts.length === 1) return parts[0];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[parseInt(parts[1], 10) - 1] ?? parts[1];
  if (parts.length === 2) return `${month} ${parts[0]}`;
  return `${month} ${parseInt(parts[2], 10)}, ${parts[0]}`;
};

export const sortReleases = (releases: DiscoveredRelease[], sortBy: ReleaseSort, dir: SortDir): DiscoveredRelease[] => {
  const sorted = [...releases].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "artist":
        cmp = a.artist_name.localeCompare(b.artist_name);
        break;
      case "title":
        cmp = a.title.localeCompare(b.title);
        break;
      case "type":
        cmp = (a.release_type ?? "").localeCompare(b.release_type ?? "");
        break;
      case "date":
        cmp = (a.first_release_date ?? "").localeCompare(b.first_release_date ?? "");
        break;
    }
    return cmp;
  });
  return dir === "desc" ? sorted.reverse() : sorted;
};
