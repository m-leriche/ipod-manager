import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { usePlayback } from "../../../contexts/PlaybackContext";
import { usePlaylist } from "../../../contexts/PlaylistContext";
import { useToast } from "../../../contexts/ToastContext";
import { useProgress } from "../../../contexts/ProgressContext";
import { useArtCache } from "../../../contexts/ArtCacheContext";
import { useUndo } from "../../../contexts/UndoContext";
import { pickFile } from "../../../utils/pickPath";
import { groupByPreviousValue } from "../../../utils/undoHelpers";
import type { LibraryTrack, LibraryFilter, AlbumSummary } from "../../../types/library";

export const useLibraryActions = (fetchBrowserData: () => Promise<void>, tracks: (LibraryTrack | undefined)[]) => {
  const { playTrack, addToQueue } = usePlayback();
  const { addTracks: addToPlaylistCtx } = usePlaylist();
  const toast = useToast();
  const { push: pushUndo } = useUndo();
  const { start: startProgress, update: updateProgress, finish: finishProgress, fail: failProgress } = useProgress();
  const { bumpArtCache } = useArtCache();

  const resolveTracks = useCallback(
    (trackIds: number[]): LibraryTrack[] => {
      const idSet = new Set(trackIds);
      return tracks.filter((t): t is LibraryTrack => !!t && idSet.has(t.id));
    },
    [tracks],
  );

  const handleFlagTracks = useCallback(
    async (trackIds: number[], flagged: boolean) => {
      const previous = groupByPreviousValue(resolveTracks(trackIds), (t) => t.flagged, flagged);
      try {
        await invoke("flag_tracks", { trackIds, flagged });
        await fetchBrowserData();
        if (previous.size > 0) {
          const changed = [...previous.values()].reduce((n, ids) => n + ids.length, 0);
          const label = `sync flag change (${changed} track${changed !== 1 ? "s" : ""})`;
          pushUndo({
            label,
            undo: async () => {
              for (const [prevFlagged, ids] of previous) {
                await invoke("flag_tracks", { trackIds: ids, flagged: prevFlagged });
              }
              await fetchBrowserData();
            },
          });
          toast.success(`${label} — ⌘Z to undo`);
        }
      } catch (e) {
        toast.error(`Failed to update sync flags: ${e}`);
      }
    },
    [fetchBrowserData, toast, pushUndo, resolveTracks],
  );

  const handleRateTracks = useCallback(
    async (trackIds: number[], rating: number) => {
      const previous = groupByPreviousValue(resolveTracks(trackIds), (t) => t.rating, rating);
      try {
        await invoke("rate_tracks", { trackIds, rating });
        await fetchBrowserData();
        if (previous.size > 0) {
          const changed = [...previous.values()].reduce((n, ids) => n + ids.length, 0);
          const label = `rating change (${changed} track${changed !== 1 ? "s" : ""})`;
          pushUndo({
            label,
            undo: async () => {
              for (const [prevRating, ids] of previous) {
                await invoke("rate_tracks", { trackIds: ids, rating: prevRating });
              }
              await fetchBrowserData();
            },
          });
          toast.success(`${label} — ⌘Z to undo`);
        }
      } catch (e) {
        toast.error(`Failed to update ratings: ${e}`);
      }
    },
    [fetchBrowserData, toast, pushUndo, resolveTracks],
  );

  const handleRepairAlbumArt = useCallback(
    async (selectedTracks: LibraryTrack[]) => {
      const folders = [...new Set(selectedTracks.map((t) => t.folder_path))];
      startProgress(`Repairing album art for ${folders.length} album${folders.length === 1 ? "" : "s"}\u2026`, () =>
        invoke("cancel_sync"),
      );

      const unlisten = await listen<{ total: number; completed: number; current_album: string }>(
        "albumart-progress",
        (event) => {
          const { total, completed, current_album } = event.payload;
          updateProgress(completed, total, current_album);
        },
      );

      try {
        const result = await invoke<{ cancelled: boolean; fixed: number }>("fix_album_art", { folders });
        if (result.cancelled) {
          failProgress("Album art repair cancelled");
        } else {
          finishProgress(`Album art repair complete — ${result.fixed} fixed`);
        }
        bumpArtCache();
        await fetchBrowserData();
      } catch (e) {
        failProgress(`Album art repair failed: ${e}`);
      } finally {
        unlisten();
      }
    },
    [fetchBrowserData, startProgress, updateProgress, finishProgress, failProgress, bumpArtCache],
  );

  const handleFetchLyrics = useCallback(
    async (selectedTracks: LibraryTrack[]) => {
      const eligible = selectedTracks.filter((t) => t.artist || t.title);
      if (eligible.length === 0) return;

      let fetched = 0;
      let failed = 0;
      for (const track of eligible) {
        try {
          await invoke("fetch_lyrics", {
            trackId: track.id,
            artist: track.artist || "",
            title: track.title || track.file_name,
            album: track.album,
            durationSecs: track.duration_secs || null,
            filePath: track.file_path,
          });
          fetched++;
        } catch {
          failed++;
        }
      }
      if (eligible.length === 1) {
        const name = eligible[0].title || eligible[0].file_name;
        if (fetched) toast.success(`Lyrics fetched for "${name}"`);
        else toast.error(`No lyrics found for "${name}"`);
      } else {
        if (fetched > 0) toast.success(`Lyrics fetched for ${fetched} track${fetched === 1 ? "" : "s"}`);
        if (failed > 0) toast.error(`No lyrics found for ${failed} track${failed === 1 ? "" : "s"}`);
      }
    },
    [toast],
  );

  const handleRemoveLyrics = useCallback(
    async (selectedTracks: LibraryTrack[]) => {
      let removed = 0;
      let failed = 0;
      for (const track of selectedTracks) {
        try {
          await invoke("remove_lyrics", {
            trackId: track.id,
            filePath: track.file_path,
          });
          removed++;
        } catch {
          failed++;
        }
      }
      if (selectedTracks.length === 1) {
        const name = selectedTracks[0].title || selectedTracks[0].file_name;
        if (removed) toast.success(`Lyrics removed for "${name}"`);
        else toast.error(`Failed to remove lyrics for "${name}"`);
      } else {
        if (removed > 0) toast.success(`Lyrics removed for ${removed} track${removed === 1 ? "" : "s"}`);
        if (failed > 0) toast.error(`Failed to remove lyrics for ${failed} track${failed === 1 ? "" : "s"}`);
      }
    },
    [toast],
  );

  const handleFixAlbumArtForAlbum = useCallback(
    async (album: AlbumSummary) => {
      startProgress(`Repairing album art for "${album.name}"\u2026`, () => invoke("cancel_sync"));

      const unlisten = await listen<{ total: number; completed: number; current_album: string }>(
        "albumart-progress",
        (event) => {
          const { total, completed, current_album } = event.payload;
          updateProgress(completed, total, current_album);
        },
      );

      try {
        const result = await invoke<{ cancelled: boolean; fixed: number }>("fix_album_art", {
          folders: [album.folder_path],
        });
        if (result.cancelled) {
          failProgress("Album art repair cancelled");
        } else {
          finishProgress("Album art repair complete");
        }
        bumpArtCache();
        await fetchBrowserData();
      } catch (e) {
        failProgress(`Album art repair failed: ${e}`);
      } finally {
        unlisten();
      }
    },
    [fetchBrowserData, startProgress, updateProgress, finishProgress, failProgress, bumpArtCache],
  );

  const handleUploadAlbumArt = useCallback(
    async (album: AlbumSummary) => {
      const imagePath = await pickFile("Select album artwork", [
        { name: "Images", extensions: ["jpg", "jpeg", "png", "bmp", "webp"] },
      ]);
      if (!imagePath) return;

      try {
        await invoke("upload_album_art", { folderPath: album.folder_path, imagePath });
        bumpArtCache();
        await fetchBrowserData();
      } catch (e) {
        console.error("Failed to upload album art:", e);
      }
    },
    [fetchBrowserData, bumpArtCache],
  );

  // ── Column browser context menu handlers ──────────────────────

  const getTracksForColumnAction = useCallback(
    (action: { column: string; values: string[] }) => {
      const valSet = new Set(action.values);
      return tracks.filter((t): t is LibraryTrack => {
        if (!t) return false;
        switch (action.column) {
          case "genre":
            // Genre values can be "; "-joined lists — match any part
            return (
              t.genre != null &&
              t.genre
                .split(";")
                .map((g) => g.trim())
                .some((g) => valSet.has(g))
            );
          case "artist":
            return t.artist != null && valSet.has(t.artist);
          case "album":
            return t.album != null && valSet.has(t.album);
          default:
            return false;
        }
      });
    },
    [tracks],
  );

  const handleColumnPlayAll = useCallback(
    async (action: { column: string; values: string[] }) => {
      const matched = getTracksForColumnAction(action);
      if (matched.length > 0) {
        playTrack(matched[0], matched);
        return;
      }
      try {
        const filter: LibraryFilter = {
          sort_by: "track_number",
          sort_direction: "asc",
          ...(action.column === "genre" ? { genre: action.values } : {}),
          ...(action.column === "artist" ? { artist: action.values } : {}),
          ...(action.column === "album" ? { album: action.values } : {}),
        };
        const fetched = await invoke<LibraryTrack[]>("get_library_tracks", { filter });
        if (fetched.length > 0) playTrack(fetched[0], fetched);
      } catch (e) {
        console.error("Failed to fetch tracks for playback:", e);
      }
    },
    [getTracksForColumnAction, playTrack],
  );

  const handleColumnAddToQueue = useCallback(
    (action: { column: string; values: string[] }) => {
      const matched = getTracksForColumnAction(action);
      if (matched.length > 0) addToQueue(matched);
    },
    [getTracksForColumnAction, addToQueue],
  );

  const handleColumnAddToPlaylist = useCallback(
    (action: { column: string; values: string[] }, playlistId: number) => {
      const matched = getTracksForColumnAction(action);
      if (matched.length > 0)
        addToPlaylistCtx(
          playlistId,
          matched.map((t) => t.id),
        );
    },
    [getTracksForColumnAction, addToPlaylistCtx],
  );

  return {
    handleFlagTracks,
    handleRateTracks,
    handleRepairAlbumArt,
    handleFetchLyrics,
    handleRemoveLyrics,
    handleFixAlbumArtForAlbum,
    handleUploadAlbumArt,
    handleColumnPlayAll,
    handleColumnAddToQueue,
    handleColumnAddToPlaylist,
  };
};
