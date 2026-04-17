import type { BrowserData } from "../../../types/library";

// ── IndexedDB Cache for Instant Library Mount ───────────────────

const DB_NAME = "crate-library-cache";
const DB_VERSION = 1;
const STORE_NAME = "cache";
const CACHE_KEY = "browser-data";

export interface CachedLibraryData {
  hasLibrary: boolean;
  browserData: BrowserData;
  cachedAt: number;
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
