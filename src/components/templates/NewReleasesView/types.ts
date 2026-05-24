import type { DiscoveredRelease } from "../../../types/releases";

export type ReleaseSort = "artist" | "title" | "type" | "date";
export type SortDir = "asc" | "desc";

export interface ArtistGroup {
  artistName: string;
  releases: DiscoveredRelease[];
}
