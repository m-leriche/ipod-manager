import type { LibraryTrack } from "../../../types/library";

/**
 * Given a track and the visible track list, returns all tracks from the same album
 * sorted by disc number then track number. If the track has no album, returns just
 * that track.
 */
export const getAlbumTracks = (track: LibraryTrack, allTracks: LibraryTrack[]): LibraryTrack[] => {
  if (!track.album) return [track];

  const key = `${track.album}::${track.album_artist || track.artist}`;
  return allTracks
    .filter((t) => `${t.album}::${t.album_artist || t.artist}` === key)
    .sort((a, b) => {
      const discA = a.disc_number ?? 1;
      const discB = b.disc_number ?? 1;
      if (discA !== discB) return discA - discB;
      return (a.track_number ?? 0) - (b.track_number ?? 0);
    });
};
