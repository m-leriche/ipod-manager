import { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";
import { listen } from "@tauri-apps/api/event";

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

  // Forward per-folder fix events from Tauri to DOM so AlbumArtwork can respond individually
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<string>("album-art-fixed", (event) => {
      window.dispatchEvent(new CustomEvent("album-art-fixed", { detail: event.payload }));
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  const value = useMemo(() => ({ artCacheBust, bumpArtCache }), [artCacheBust, bumpArtCache]);

  return <ArtCacheContext.Provider value={value}>{children}</ArtCacheContext.Provider>;
};

export const useArtCache = (): ArtCacheContextValue => useContext(ArtCacheContext);
