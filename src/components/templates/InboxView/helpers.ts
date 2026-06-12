import type { InboxAlbum } from "./types";

export const isBlocked = (album: InboxAlbum): boolean => Object.values(album.checks).some((c) => c.status === "fail");

export const isPending = (album: InboxAlbum): boolean =>
  Object.values(album.checks).some((c) => c.status === "pending");

export const isReady = (album: InboxAlbum): boolean => !isBlocked(album) && !isPending(album);

export const albumLabel = (album: InboxAlbum): string =>
  album.artist && album.album ? `${album.artist} – ${album.album}` : album.folder_name;
