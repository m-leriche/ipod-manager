import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LibraryTrack } from "../../../types/library";
import { buildGenreMapLayout } from "./helpers";
import { TRACK_FETCH_LIMIT } from "./constants";

export const useGenreMapData = () => {
  // null = still loading
  const [tracks, setTracks] = useState<LibraryTrack[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const result = await invoke<LibraryTrack[]>("get_library_tracks", {
        filter: { limit: TRACK_FETCH_LIMIT },
      });
      setTracks(result);
      setError(null);
    } catch (e) {
      setTracks([]);
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const layout = useMemo(() => (tracks && tracks.length > 0 ? buildGenreMapLayout(tracks) : null), [tracks]);

  return { layout, trackCount: tracks?.length ?? 0, loading: tracks === null, error, reload };
};
