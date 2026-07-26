import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { InboxAlbum, ReleaseComparison } from "./types";

/**
 * Loads the MusicBrainz release an album was checked against. Deferred until
 * the user opens the comparison — the lookup costs a rate-limited round trip
 * that most albums never need.
 */
export const useReleaseComparison = (album: InboxAlbum) => {
  const [comparison, setComparison] = useState<ReleaseComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Each lookup waits behind MusicBrainz's rate limit, so two quick picks from
  // the alternatives list overlap. Only the newest one may touch state.
  const latest = useRef(0);

  const load = useCallback(
    async (mbid?: string) => {
      if (!album.artist || !album.album) return;
      const request = ++latest.current;
      setLoading(true);
      setError(null);
      try {
        const result = await invoke<ReleaseComparison>("compare_inbox_release", {
          artist: album.artist,
          album: album.album,
          trackCount: album.tracks.length,
          mbid: mbid ?? null,
        });
        if (request !== latest.current) return;
        setComparison(result);
      } catch (e) {
        if (request !== latest.current) return;
        setComparison(null);
        setError(String(e));
      } finally {
        if (request === latest.current) setLoading(false);
      }
    },
    [album.artist, album.album, album.tracks.length],
  );

  useEffect(() => {
    if (!comparison && !loading && !error) void load();
  }, [comparison, loading, error, load]);

  return { comparison, loading, error, reload: load };
};
