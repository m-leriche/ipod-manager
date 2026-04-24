import type { ColumnDef } from "./useColumnResize";
import type { LibraryTrack } from "../../../types/library";

export interface TrackTableColumn {
  key: string;
  label: string;
  sortKey: string;
  align: "left" | "right";
  def: ColumnDef;
}

export const COLUMNS: TrackTableColumn[] = [
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
    key: "plays",
    label: "Plays",
    sortKey: "play_count",
    align: "right",
    def: { key: "plays", minWidth: 40, initialWidth: 50 },
  },
];

export const COLUMN_DEFS = COLUMNS.map((c) => c.def);

export const ROW_HEIGHT = 31;

export const SORT_KEY_TO_TRACK_FIELD: Record<string, keyof LibraryTrack> = {
  title: "title",
  artist: "artist",
  album: "album",
  genre: "genre",
};

export const CELL_CLASSES: Record<string, string> = {
  "#": "px-3 py-[7px] text-[11px] tabular-nums text-center overflow-hidden",
  title: "px-3 py-[7px] overflow-hidden",
  artist: "px-3 py-[7px] text-[11px] text-text-secondary overflow-hidden truncate",
  album: "px-3 py-[7px] text-[11px] text-text-tertiary overflow-hidden truncate",
  genre: "px-3 py-[7px] text-[11px] text-text-tertiary overflow-hidden truncate",
  track_number: "px-3 py-[7px] text-[11px] text-text-tertiary tabular-nums text-right overflow-hidden",
  year: "px-3 py-[7px] text-[11px] text-text-tertiary tabular-nums text-right overflow-hidden",
  duration: "px-3 py-[7px] text-[11px] text-text-tertiary tabular-nums text-right overflow-hidden",
  date_added: "px-3 py-[7px] text-[11px] text-text-tertiary overflow-hidden truncate",
  plays: "px-3 py-[7px] text-[11px] text-text-tertiary tabular-nums text-right overflow-hidden",
};
