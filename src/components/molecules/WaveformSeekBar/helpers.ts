const CACHE_LIMIT = 50;
const peaksCache = new Map<string, [number, number][]>();

export const getCachedPeaks = (filePath: string): [number, number][] | null => {
  const peaks = peaksCache.get(filePath);
  if (!peaks) return null;
  // Refresh LRU position
  peaksCache.delete(filePath);
  peaksCache.set(filePath, peaks);
  return peaks;
};

export const setCachedPeaks = (filePath: string, peaks: [number, number][]): void => {
  if (peaksCache.size >= CACHE_LIMIT && !peaksCache.has(filePath)) {
    const oldest = peaksCache.keys().next().value;
    if (oldest !== undefined) peaksCache.delete(oldest);
  }
  peaksCache.set(filePath, peaks);
};
