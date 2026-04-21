export interface EditableTrackFields {
  title: string;
  artist: string;
  album: string;
  album_artist: string;
  genre: string;
  year: string;
  track_number: string;
  track_total: string;
  disc_number: string;
  disc_total: string;
}

export type EditableFieldKey = keyof EditableTrackFields;
