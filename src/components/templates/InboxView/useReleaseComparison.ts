import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { InboxAlbum, ReleaseComparison } from "./types";

/**
 * Loads the MusicBrainz release an album was checked against. Deferred until
 * the user opens the comparison — the lookup costs a rate-limited round trip
 * that most albums never need.
 */
export const useReleaseComparison = (album: InboxAlbum, enabled: boolean) => {
  const [comparison, setComparison] = useState<ReleaseComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mbid?: string) => {
      if (!album.artist || !album.album) return;
      setLoading(true);
      setError(null);
      try {
        setComparison(
          await invoke<ReleaseComparison>("compare_inbox_release", {
            artist: album.artist,
            album: album.album,
            trackCount: album.tracks.length,
            mbid: mbid ?? null,
          }),
        );
      } catch (e) {
        setComparison(null);
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [album.artist, album.album, album.tracks.length],
  );

  useEffect(() => {
    if (enabled && !comparison && !loading && !error) void load();
  }, [enabled, comparison, loading, error, load]);

  return { comparison, loading, error, reload: load };
};
