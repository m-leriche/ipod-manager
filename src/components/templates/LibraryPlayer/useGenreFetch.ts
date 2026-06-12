import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useProgress } from "../../../contexts/ProgressContext";
import { useToast } from "../../../contexts/ToastContext";
import type { LibraryTrack } from "../../../types/library";
import type { MetadataUpdate, MetadataSaveProgress, MetadataSaveResult } from "../../../types/metadata";
import type { AcceptedGenre, AlbumGenreQuery, GenreLookupOutcome, GenreLookupProgress } from "./types";

const albumKey = (artist: string, album: string): string => `${artist}::${album}`;

export const useGenreFetch = (fetchBrowserData: () => Promise<void>) => {
  const toast = useToast();
  const { start: startProgress, update: updateProgress, finish: finishProgress, fail: failProgress } = useProgress();
  const [genreResults, setGenreResults] = useState<GenreLookupOutcome | null>(null);
  const [fetching, setFetching] = useState(false);

  const runLookup = useCallback(
    async (albums: AlbumGenreQuery[] | null) => {
      setFetching(true);
      const label = albums
        ? `Looking up genres for ${albums.length} album${albums.length === 1 ? "" : "s"}…`
        : "Looking up genres for entire library…";
      startProgress(label, () => invoke("cancel_genre_lookup"));

      const unlisten = await listen<GenreLookupProgress>("genre-lookup-progress", (e) => {
        updateProgress(e.payload.completed, e.payload.total, e.payload.current);
      });

      try {
        const outcome = await invoke<GenreLookupOutcome>("lookup_album_genres", { albums });
        finishProgress(outcome.cancelled ? "Genre lookup cancelled" : "Genre lookup complete");
        setGenreResults(outcome);
      } catch (e) {
        failProgress(`Genre lookup failed: ${e}`);
      } finally {
        unlisten();
        setFetching(false);
      }
    },
    [startProgress, updateProgress, finishProgress, failProgress],
  );

  const fetchForTracks = useCallback(
    (selectedTracks: LibraryTrack[]) => {
      if (fetching) return;
      const seen = new Map<string, AlbumGenreQuery>();
      for (const t of selectedTracks) {
        const artist = t.album_artist || t.artist || "";
        const album = t.album || "";
        if (!artist || !album) continue;
        const key = albumKey(artist, album);
        if (!seen.has(key)) seen.set(key, { artist, album, current_genre: t.genre });
      }
      const albums = [...seen.values()];
      if (albums.length === 0) {
        toast.error("Selected tracks have no artist/album info to look up");
        return;
      }
      void runLookup(albums);
    },
    [fetching, runLookup, toast],
  );

  const fetchForLibrary = useCallback(() => {
    if (fetching) return;
    void runLookup(null);
  }, [fetching, runLookup]);

  const dismissResults = useCallback(() => setGenreResults(null), []);

  const applyResults = useCallback(
    async (accepted: AcceptedGenre[]) => {
      setGenreResults(null);
      if (accepted.length === 0) return;

      let unlisten: (() => void) | undefined;
      try {
        // Fetch every track of each accepted album so the whole album is
        // updated, not just the tracks that were selected for the lookup.
        const albumNames = [...new Set(accepted.map((a) => a.result.album))];
        const tracks = await invoke<LibraryTrack[]>("get_library_tracks", { filter: { album: albumNames } });

        const genreByKey = new Map(accepted.map((a) => [albumKey(a.result.artist, a.result.album), a.genre]));
        const updates: MetadataUpdate[] = [];
        for (const t of tracks) {
          const genre = genreByKey.get(albumKey(t.album_artist || t.artist || "", t.album || ""));
          if (genre) updates.push({ file_path: t.file_path, genre });
        }
        if (updates.length === 0) return;

        startProgress(`Applying genres to ${updates.length} track${updates.length === 1 ? "" : "s"}…`, () =>
          invoke("cancel_sync"),
        );
        unlisten = await listen<MetadataSaveProgress>("metadata-save-progress", (e) => {
          updateProgress(e.payload.completed, e.payload.total, e.payload.current_file);
        });

        const result = await invoke<MetadataSaveResult>("save_metadata", { updates });
        const albums = accepted.length;
        if (result.cancelled) {
          failProgress("Genre apply cancelled");
        } else if (result.failed > 0) {
          failProgress(`Genres applied to ${result.succeeded} tracks, ${result.failed} failed`);
        } else {
          finishProgress(
            `Genres applied to ${result.succeeded} track${result.succeeded === 1 ? "" : "s"} across ${albums} album${albums === 1 ? "" : "s"}`,
          );
        }
        await fetchBrowserData();
      } catch (e) {
        failProgress(`Failed to apply genres: ${e}`);
      } finally {
        unlisten?.();
      }
    },
    [fetchBrowserData, startProgress, updateProgress, finishProgress, failProgress],
  );

  return { genreResults, fetching, fetchForTracks, fetchForLibrary, applyResults, dismissResults };
};
