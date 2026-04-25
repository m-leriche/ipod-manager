export type Phase = "idle" | "scanning" | "scanned";
export type PlayDataSort = "most_played" | "least_recent" | "highest_rated" | "never_played";

export type StatsFilterCategory = "format" | "genre" | "sample_rate" | "year";

export interface StatsFilter {
  category: StatsFilterCategory;
  value: string;
  displayLabel: string;
}

export type DetailSortKey = "path" | "artist" | "album" | "title" | "size";
export type DetailSortDir = "asc" | "desc";
