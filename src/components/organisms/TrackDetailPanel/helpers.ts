import type { LibraryTrack } from "../../../types/library";
import type { MetadataUpdate } from "../../../types/metadata";
import type { EditableTrackFields, EditableFieldKey } from "./types";

export const trackToEditable = (track: LibraryTrack): EditableTrackFields => ({
  title: track.title ?? "",
  artist: track.artist ?? "",
  album: track.album ?? "",
  album_artist: track.album_artist ?? "",
  sort_artist: track.sort_artist ?? "",
  genre: track.genre ?? "",
  year: track.year?.toString() ?? "",
  track_number: track.track_number?.toString() ?? "",
  track_total: track.track_total?.toString() ?? "",
  disc_number: track.disc_number?.toString() ?? "",
  disc_total: track.disc_total?.toString() ?? "",
  compilation: track.compilation ? "1" : "0",
});

export const computeBatchFields = (
  tracks: LibraryTrack[],
): { fields: EditableTrackFields; mixed: Record<EditableFieldKey, boolean> } => {
  if (tracks.length === 0) {
    const empty: EditableTrackFields = {
      title: "",
      artist: "",
      album: "",
      album_artist: "",
      sort_artist: "",
      genre: "",
      year: "",
      track_number: "",
      track_total: "",
      disc_number: "",
      disc_total: "",
      compilation: "0",
    };
    const mixed = Object.fromEntries(Object.keys(empty).map((k) => [k, false])) as Record<EditableFieldKey, boolean>;
    return { fields: empty, mixed };
  }

  const first = trackToEditable(tracks[0]);
  const mixed = Object.fromEntries(Object.keys(first).map((k) => [k, false])) as Record<EditableFieldKey, boolean>;

  for (let i = 1; i < tracks.length; i++) {
    const current = trackToEditable(tracks[i]);
    for (const key of Object.keys(first) as EditableFieldKey[]) {
      if (!mixed[key] && current[key] !== first[key]) {
        mixed[key] = true;
      }
    }
  }

  const fields = { ...first };
  for (const key of Object.keys(fields) as EditableFieldKey[]) {
    if (mixed[key]) fields[key] = "";
  }

  return { fields, mixed };
};

const parseOptionalNumber = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const num = parseInt(trimmed, 10);
  return isNaN(num) ? undefined : num;
};

export const buildMetadataUpdates = (
  tracks: LibraryTrack[],
  editedFields: EditableTrackFields,
  originalFields: EditableTrackFields,
  mixed: Record<EditableFieldKey, boolean>,
): MetadataUpdate[] => {
  // Determine which fields actually changed (skip mixed fields that weren't touched)
  const changedKeys: EditableFieldKey[] = [];
  for (const key of Object.keys(editedFields) as EditableFieldKey[]) {
    if (mixed[key] && editedFields[key] === "") continue; // mixed + untouched
    if (editedFields[key] !== originalFields[key]) changedKeys.push(key);
    if (mixed[key] && editedFields[key] !== "") changedKeys.push(key); // mixed + user typed a value
  }

  // Deduplicate
  const uniqueChanged = [...new Set(changedKeys)];
  if (uniqueChanged.length === 0) return [];

  return tracks.map((track) => {
    const update: MetadataUpdate = { file_path: track.file_path };

    for (const key of uniqueChanged) {
      switch (key) {
        case "title":
          update.title = editedFields.title;
          break;
        case "artist":
          update.artist = editedFields.artist;
          break;
        case "album":
          update.album = editedFields.album;
          break;
        case "album_artist":
          update.album_artist = editedFields.album_artist;
          break;
        case "sort_artist":
          update.sort_artist = editedFields.sort_artist;
          break;
        case "genre":
          update.genre = editedFields.genre;
          break;
        case "year":
          update.year = parseOptionalNumber(editedFields.year);
          break;
        case "track_number":
          update.track = parseOptionalNumber(editedFields.track_number);
          break;
        case "track_total":
          update.track_total = parseOptionalNumber(editedFields.track_total);
          break;
        case "disc_number":
          update.disc_number = parseOptionalNumber(editedFields.disc_number);
          break;
        case "disc_total":
          update.disc_total = parseOptionalNumber(editedFields.disc_total);
          break;
        case "compilation":
          update.compilation = editedFields.compilation === "1";
          break;
      }
    }

    return update;
  });
};
