import type { InboxAlbum, InboxTrack } from "./types";

export const isBlocked = (album: InboxAlbum): boolean => Object.values(album.checks).some((c) => c.status === "fail");

export const isPending = (album: InboxAlbum): boolean =>
  Object.values(album.checks).some((c) => c.status === "pending");

export const isReady = (album: InboxAlbum): boolean => !isBlocked(album) && !isPending(album);

export const albumLabel = (album: InboxAlbum): string =>
  album.artist && album.album ? `${album.artist} – ${album.album}` : album.folder_name;

export const deleteOriginalsMessage = (count: number): string =>
  count === 1
    ? "Move the original folder and its remaining content to the Trash?"
    : `Move the ${count} original folders and their remaining content to the Trash?`;

export const formatTrackQuality = (t: InboxTrack): string => {
  const parts = [t.format.toUpperCase()];
  if (t.bit_depth) parts.push(`${t.bit_depth}-bit`);
  if (t.sample_rate) parts.push(`${(t.sample_rate / 1000).toFixed(1)} kHz`);
  if (t.bitrate_kbps) parts.push(`${t.bitrate_kbps} kbps`);
  return parts.join(" · ");
};
