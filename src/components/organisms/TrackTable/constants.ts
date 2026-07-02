import type { ColumnDef } from "./useColumnResize";
import type { LibraryTrack } from "../../../types/library";

export interface TrackTableColumn {
  key: string;
  label: string;
  sortKey: string;
  align: "left" | "right";
  def: ColumnDef;
  /** Hidden until the user enables it in the column picker. */
  defaultHidden?: boolean;
}

export const COLUMNS: TrackTableColumn[] = [
  {
    key: "flagged",
    label: "Sync",
    sortKey: "flagged",
    align: "left",
    def: { key: "flagged", minWidth: 32, initialWidth: 36 },
  },
  { key: "#", label: "#", sortKey: "track_number", align: "left", def: { key: "#", minWidth: 40, initialWidth: 40 } },
  {
    key: "title",
    label: "Title",
    sortKey: "title",
    align: "left",
    def: { key: "title", minWidth: 100, initialWidth: 280 },
  },
  {
    key: "artist",
    label: "Artist",
    sortKey: "artist",
    align: "left",
    def: { key: "artist", minWidth: 80, initialWidth: 200 },
  },
  {
    key: "album",
    label: "Album",
    sortKey: "album",
    align: "left",
    def: { key: "album", minWidth: 80, initialWidth: 200 },
  },
  {
    key: "genre",
    label: "Genre",
    sortKey: "genre",
    align: "left",
    def: { key: "genre", minWidth: 60, initialWidth: 120 },
  },
  {
    key: "track_number",
    label: "Track",
    sortKey: "track_number",
    align: "right",
    def: { key: "track_number", minWidth: 40, initialWidth: 50 },
  },
  {
    key: "year",
    label: "Year",
    sortKey: "year",
    align: "right",
    def: { key: "year", minWidth: 45, initialWidth: 55 },
  },
  {
    key: "duration",
    label: "Time",
    sortKey: "duration",
    align: "right",
    def: { key: "duration", minWidth: 45, initialWidth: 55 },
  },
  {
    key: "date_added",
    label: "Date Added",
    sortKey: "date_added",
    align: "left",
    def: { key: "date_added", minWidth: 70, initialWidth: 90 },
  },
  {
    key: "rating",
    label: "Rating",
    sortKey: "rating",
    align: "left",
    def: { key: "rating", minWidth: 60, initialWidth: 80 },
  },
  {
    key: "plays",
    label: "Plays",
    sortKey: "play_count",
    align: "right",
    def: { key: "plays", minWidth: 40, initialWidth: 50 },
  },
  {
    key: "album_artist",
    label: "Album Artist",
    sortKey: "album_artist",
    align: "left",
    def: { key: "album_artist", minWidth: 80, initialWidth: 160 },
    defaultHidden: true,
  },
  {
    key: "disc_number",
    label: "Disc",
    sortKey: "disc_number",
    align: "right",
    def: { key: "disc_number", minWidth: 40, initialWidth: 50 },
    defaultHidden: true,
  },
  {
    key: "format",
    label: "Kind",
    sortKey: "format",
    align: "left",
    def: { key: "format", minWidth: 45, initialWidth: 60 },
    defaultHidden: true,
  },
  {
    key: "bitrate",
    label: "Bitrate",
    sortKey: "bitrate",
    align: "right",
    def: { key: "bitrate", minWidth: 55, initialWidth: 75 },
    defaultHidden: true,
  },
  {
    key: "sample_rate",
    label: "Sample Rate",
    sortKey: "sample_rate",
    align: "right",
    def: { key: "sample_rate", minWidth: 65, initialWidth: 90 },
    defaultHidden: true,
  },
  {
    key: "file_size",
    label: "Size",
    sortKey: "file_size",
    align: "right",
    def: { key: "file_size", minWidth: 55, initialWidth: 70 },
    defaultHidden: true,
  },
  {
    key: "last_played",
    label: "Last Played",
    sortKey: "last_played",
    align: "left",
    def: { key: "last_played", minWidth: 70, initialWidth: 95 },
    defaultHidden: true,
  },
];

export const COLUMN_DEFS = COLUMNS.map((c) => c.def);

export const ROW_HEIGHT = 31;

/** Rows past the viewport to prefetch so slow scrolling never shows skeletons. */
export const LOAD_AHEAD_ROWS = 100;

export const SORT_KEY_TO_TRACK_FIELD: Record<string, keyof LibraryTrack> = {
  title: "title",
  artist: "artist",
  album: "album",
  genre: "genre",
  album_artist: "album_artist",
};

export const CELL_CLASSES: Record<string, string> = {
  flagged: "px-1 py-[7px] text-center overflow-hidden",
  "#": "px-3 py-[7px] text-[11px] tabular-nums text-center overflow-hidden",
  title: "px-3 py-[7px] overflow-hidden",
  artist: "px-3 py-[7px] text-[11px] text-text-secondary overflow-hidden truncate",
  album: "px-3 py-[7px] text-[11px] text-text-tertiary overflow-hidden truncate",
  genre: "px-3 py-[7px] text-[11px] text-text-tertiary overflow-hidden truncate",
  track_number: "px-3 py-[7px] text-[11px] text-text-tertiary tabular-nums text-right overflow-hidden",
  year: "px-3 py-[7px] text-[11px] text-text-tertiary tabular-nums text-right overflow-hidden",
  duration: "px-3 py-[7px] text-[11px] text-text-tertiary tabular-nums text-right overflow-hidden",
  date_added: "px-3 py-[7px] text-[11px] text-text-tertiary overflow-hidden truncate",
  rating: "px-1 py-[7px] overflow-hidden",
  plays: "px-3 py-[7px] text-[11px] text-text-tertiary tabular-nums text-right overflow-hidden",
  album_artist: "px-3 py-[7px] text-[11px] text-text-secondary overflow-hidden truncate",
  disc_number: "px-3 py-[7px] text-[11px] text-text-tertiary tabular-nums text-right overflow-hidden",
  format: "px-3 py-[7px] text-[11px] text-text-tertiary overflow-hidden truncate",
  bitrate: "px-3 py-[7px] text-[11px] text-text-tertiary tabular-nums text-right overflow-hidden",
  sample_rate: "px-3 py-[7px] text-[11px] text-text-tertiary tabular-nums text-right overflow-hidden",
  file_size: "px-3 py-[7px] text-[11px] text-text-tertiary tabular-nums text-right overflow-hidden",
  last_played: "px-3 py-[7px] text-[11px] text-text-tertiary overflow-hidden truncate",
};
