import type { BrowserData, LibraryTrack } from "../../../types/library";

// ── IndexedDB Cache for Instant Library Mount ───────────────────

const DB_NAME = "crate-library-cache";
const DB_VERSION = 1;
const STORE_NAME = "cache";
const CACHE_KEY = "browser-data";

export interface CachedLibraryData {
  hasLibrary: boolean;
  browserData: BrowserData;
  totalTrackCount?: number;
  cachedAt: number;
  /** Library location the cache was built from. A cache written for a
      different library (location switched, DB restored) must not be shown. */
  libraryPath?: string | null;
}

let dbPromise: Promise<IDBDatabase> | null = null;

const openCacheDb = (): Promise<IDBDatabase> => {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error);
      };
    });
  }
  return dbPromise;
};

export const getCachedLibrary = async (): Promise<CachedLibraryData | null> => {
  try {
    const db = await openCacheDb();
    return new Promise<CachedLibraryData | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(CACHE_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
};

export const setCachedLibrary = async (data: CachedLibraryData): Promise<void> => {
  try {
    const db = await openCacheDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(data, CACHE_KEY);
  } catch {
    // Cache write failures are non-critical
  }
};

// ── Post-save view reconciliation ───────────────────────────────

/** Row fields the column filters and the search box match on. A change to any of
    them can move a row in or out of a filtered view, which shifts the total
    count too. */
const FILTER_FIELDS: readonly (keyof LibraryTrack)[] = [
  "artist",
  "album_artist",
  "album",
  "genre",
  "title",
  "file_name",
];

/** Row fields feeding each sort mode's primary ordering. Artist ordering resolves
    through the album-artist and sort-artist overrides, so all four count.
    Tiebreakers are deliberately excluded: a row moving only within a tie is
    invisible, and not worth a refetch. */
const SORT_FIELDS: Record<string, readonly (keyof LibraryTrack)[]> = {
  // Title ordering falls back to the file name when a track has no title tag,
  // and reorganizing a file renames it.
  title: ["title", "file_name"],
  artist: ["artist", "album_artist", "sort_artist", "sort_album_artist"],
  album_artist: ["artist", "album_artist", "sort_artist", "sort_album_artist"],
  album: ["album"],
  genre: ["genre"],
  year: ["year"],
  track_number: ["track_number", "disc_number"],
  disc_number: ["track_number", "disc_number"],
};

/** Whether a saved row still belongs where it sits in the current view.
    A metadata edit can change filter membership (and so the total count) or sort
    position. Neither is derivable from the sparse page the browser holds — the
    row's new home may be thousands of rows away — so the caller has to refetch
    the page. Returns false for the common case: an edit that changed neither. */
export const savedRowLeavesViewStale = (
  prev: LibraryTrack,
  next: LibraryTrack,
  view: { filtered: boolean; sortBy: string },
): boolean => {
  const differs = (field: keyof LibraryTrack) => prev[field] !== next[field];
  if (view.filtered && FILTER_FIELDS.some(differs)) return true;
  return (SORT_FIELDS[view.sortBy] ?? []).some(differs);
};
