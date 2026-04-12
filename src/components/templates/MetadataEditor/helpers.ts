import type { TrackMetadata, MetadataUpdate } from "../../../types/metadata";
import type { EditableFields, ArtistGroup, AlbumGroup } from "./types";

const METADATA_FIELDS = ["title", "artist", "album", "album_artist", "sort_artist", "genre"] as const;
const NUMERIC_FIELDS = ["track", "track_total", "year"] as const;

// ── Conversion ───────────────────────────────────────────────────

export const trackToEditable = (t: TrackMetadata): EditableFields => ({
  title: t.title ?? "",
  artist: t.artist ?? "",
  album: t.album ?? "",
  album_artist: t.album_artist ?? "",
  sort_artist: t.sort_artist ?? "",
  track: t.track != null ? String(t.track) : "",
  track_total: t.track_total != null ? String(t.track_total) : "",
  year: t.year != null ? String(t.year) : "",
  genre: t.genre ?? "",
});

// ── Diffing ──────────────────────────────────────────────────────

export const buildUpdate = (original: TrackMetadata, edited: EditableFields): MetadataUpdate | null => {
  const update: MetadataUpdate = { file_path: original.file_path };
  let changed = false;

  for (const field of METADATA_FIELDS) {
    const orig = original[field] ?? "";
    if (edited[field] !== orig) {
      (update as unknown as Record<string, unknown>)[field] = edited[field];
      changed = true;
    }
  }

  for (const field of NUMERIC_FIELDS) {
    const orig = original[field];
    const editedVal = edited[field].trim();
    const parsed = editedVal === "" ? null : parseInt(editedVal, 10);
    const origStr = orig != null ? String(orig) : "";
    if (editedVal !== origStr) {
      if (parsed !== null && !isNaN(parsed)) {
        (update as unknown as Record<string, unknown>)[field] = parsed;
      }
      changed = true;
    }
  }

  return changed ? update : null;
};

export const isTrackDirty = (original: TrackMetadata, edited: EditableFields): boolean =>
  buildUpdate(original, edited) !== null;

// ── Batch fields ─────────────────────────────────────────────────

export const computeBatchFields = (
  tracks: TrackMetadata[],
  editedTracks: Record<string, EditableFields>,
): EditableFields | null => {
  if (tracks.length === 0) return null;

  const first = editedTracks[tracks[0].file_path] ?? trackToEditable(tracks[0]);
  const result: EditableFields = { ...first };

  for (let i = 1; i < tracks.length; i++) {
    const fields = editedTracks[tracks[i].file_path] ?? trackToEditable(tracks[i]);
    for (const key of Object.keys(result) as (keyof EditableFields)[]) {
      if (result[key] !== fields[key]) {
        result[key] = "";
      }
    }
  }

  return result;
};

export const computeMixedFlags = (
  tracks: TrackMetadata[],
  editedTracks: Record<string, EditableFields>,
): Record<keyof EditableFields, boolean> => {
  const flags: Record<string, boolean> = {};
  if (tracks.length <= 1) {
    for (const key of [...METADATA_FIELDS, ...NUMERIC_FIELDS]) {
      flags[key] = false;
    }
    return flags as Record<keyof EditableFields, boolean>;
  }

  const first = editedTracks[tracks[0].file_path] ?? trackToEditable(tracks[0]);
  for (const key of Object.keys(first) as (keyof EditableFields)[]) {
    flags[key] = tracks.some((t) => {
      const fields = editedTracks[t.file_path] ?? trackToEditable(t);
      return fields[key] !== first[key];
    });
  }

  return flags as Record<keyof EditableFields, boolean>;
};

// ── Grouping ─────────────────────────────────────────────────────

export const groupTracks = (tracks: TrackMetadata[], editedTracks: Record<string, EditableFields>): ArtistGroup[] => {
  const artistMap = new Map<string, Map<string, TrackMetadata[]>>();

  for (const track of tracks) {
    const edited = editedTracks[track.file_path];
    const artist = edited?.artist || track.artist || "[No Artist]";
    const album = edited?.album || track.album || "[No Album]";

    if (!artistMap.has(artist)) {
      artistMap.set(artist, new Map());
    }
    const albumMap = artistMap.get(artist)!;
    if (!albumMap.has(album)) {
      albumMap.set(album, []);
    }
    albumMap.get(album)!.push(track);
  }

  const groups: ArtistGroup[] = [];
  const sortedArtists = [...artistMap.keys()].sort((a, b) => {
    if (a === "[No Artist]") return 1;
    if (b === "[No Artist]") return -1;
    return a.localeCompare(b);
  });

  for (const artist of sortedArtists) {
    const albumMap = artistMap.get(artist)!;
    const albums: AlbumGroup[] = [];
    let trackCount = 0;

    const sortedAlbums = [...albumMap.keys()].sort((a, b) => {
      if (a === "[No Album]") return 1;
      if (b === "[No Album]") return -1;
      return a.localeCompare(b);
    });

    for (const album of sortedAlbums) {
      const albumTracks = albumMap.get(album)!;
      albumTracks.sort((a, b) => (a.track ?? 999) - (b.track ?? 999));
      albums.push({ album, artist, tracks: albumTracks });
      trackCount += albumTracks.length;
    }

    groups.push({ artist, albums, trackCount });
  }

  return groups;
};

// ── "Fix The Artists" ────────────────────────────────────────────

const THE_PREFIX = /^the\s/i;

export const countTheArtists = (tracks: TrackMetadata[]): number => {
  const artists = new Set<string>();
  for (const t of tracks) {
    const artist = t.artist ?? "";
    if (THE_PREFIX.test(artist)) {
      artists.add(artist);
    }
  }
  return artists.size;
};

export const fixTheArtists = (
  tracks: TrackMetadata[],
  editedTracks: Record<string, EditableFields>,
): Record<string, EditableFields> => {
  const result = { ...editedTracks };

  for (const track of tracks) {
    const artist = track.artist ?? "";
    if (!THE_PREFIX.test(artist)) continue;

    const rest = artist.replace(THE_PREFIX, "");
    const sorted = `${rest}, The`;

    const existing = result[track.file_path] ?? trackToEditable(track);
    result[track.file_path] = {
      ...existing,
      album_artist: sorted,
      sort_artist: sorted,
    };
  }

  return result;
};
