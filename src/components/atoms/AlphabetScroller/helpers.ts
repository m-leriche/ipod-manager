import type { AlbumSummary } from "../../../types/library";
import type { AlbumSortMode } from "../../organisms/AlbumGrid/types";

export const ALPHABET = [
  "#",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
];

/** Sort key matching the backend: strip "The ", remove non-alphanumeric, lowercase. */
export const sortKey = (s: string): string => {
  const trimmed = s.trim();
  const withoutThe = /^the /i.test(trimmed) ? trimmed.slice(4) : trimmed;
  return withoutThe.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
};

/** Get the alphabet letter for an album based on the current sort mode. */
export const getAlbumLetter = (album: AlbumSummary, sortMode: AlbumSortMode): string => {
  const field = sortMode === "artist" ? album.artist : album.name;
  const key = sortKey(field);
  if (!key) return "#";
  const first = key[0];
  return /[a-z]/.test(first) ? first.toUpperCase() : "#";
};

/**
 * Build a map of letter → index of the first album starting with that letter
 * in the already-sorted album list.
 */
export const buildLetterMap = (sortedAlbums: AlbumSummary[], sortMode: AlbumSortMode): Map<string, number> => {
  const map = new Map<string, number>();
  for (let i = 0; i < sortedAlbums.length; i++) {
    const letter = getAlbumLetter(sortedAlbums[i], sortMode);
    if (!map.has(letter)) {
      map.set(letter, i);
    }
  }
  return map;
};
