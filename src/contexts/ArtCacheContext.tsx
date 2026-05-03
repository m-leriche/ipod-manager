import { createContext, useContext, useState, useCallback } from "react";

interface ArtCacheContextValue {
  artCacheBust: number;
  bumpArtCache: () => void;
}

const ArtCacheContext = createContext<ArtCacheContextValue>({
  artCacheBust: 0,
  bumpArtCache: () => {},
});

export const ArtCacheProvider = ({ children }: { children: React.ReactNode }) => {
  const [artCacheBust, setArtCacheBust] = useState(0);
  const bumpArtCache = useCallback(() => setArtCacheBust((n) => n + 1), []);
  return <ArtCacheContext.Provider value={{ artCacheBust, bumpArtCache }}>{children}</ArtCacheContext.Provider>;
};

export const useArtCache = (): ArtCacheContextValue => useContext(ArtCacheContext);
