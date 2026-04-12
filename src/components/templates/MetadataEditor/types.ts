export type { TrackMetadata, MetadataUpdate, MetadataScanProgress, MetadataSaveResult } from "../../../types/metadata";

export type Phase = "idle" | "scanning" | "scanned" | "saving";

export interface EditableFields {
  title: string;
  artist: string;
  album: string;
  album_artist: string;
  sort_artist: string;
  track: string;
  track_total: string;
  year: string;
  genre: string;
}

export interface ArtistGroup {
  artist: string;
  albums: AlbumGroup[];
  trackCount: number;
}

export interface AlbumGroup {
  album: string;
  artist: string;
  tracks: import("../../../types/metadata").TrackMetadata[];
}
