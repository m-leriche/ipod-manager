export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "boolean";
}

export const FIELDS: FieldDef[] = [
  { key: "title", label: "Title", type: "text" },
  { key: "artist", label: "Artist", type: "text" },
  { key: "album", label: "Album", type: "text" },
  { key: "album_artist", label: "Album Artist", type: "text" },
  { key: "genre", label: "Genre", type: "text" },
  { key: "year", label: "Year", type: "number" },
  { key: "rating", label: "Rating", type: "number" },
  { key: "play_count", label: "Play Count", type: "number" },
  { key: "duration_secs", label: "Duration (sec)", type: "number" },
  { key: "bitrate_kbps", label: "Bitrate (kbps)", type: "number" },
  { key: "format", label: "Format", type: "text" },
  { key: "created_at", label: "Date Added", type: "date" },
  { key: "flagged", label: "Flagged", type: "boolean" },
];

export const OPERATORS_BY_TYPE: Record<string, { key: string; label: string }[]> = {
  text: [
    { key: "equals", label: "is" },
    { key: "not_equals", label: "is not" },
    { key: "contains", label: "contains" },
    { key: "not_contains", label: "does not contain" },
  ],
  number: [
    { key: "equals", label: "is" },
    { key: "not_equals", label: "is not" },
    { key: "greater_than", label: "is greater than" },
    { key: "less_than", label: "is less than" },
    { key: "between", label: "is between" },
  ],
  date: [{ key: "in_last_days", label: "in the last (days)" }],
  boolean: [
    { key: "is_true", label: "is true" },
    { key: "is_false", label: "is false" },
  ],
};

export const DEFAULT_RULE = { field: "artist", operator: "contains", value: "", value2: undefined };
