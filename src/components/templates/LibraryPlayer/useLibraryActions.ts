import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { usePlayback } from "../../../contexts/PlaybackContext";
import { usePlaylist } from "../../../contexts/PlaylistContext";
import { useToast } from "../../../contexts/ToastContext";
import { useProgress } from "../../../contexts/ProgressContext";
import { useArtCache } from "../../../contexts/ArtCacheContext";
import { pickFile } from "../../../utils/pickPath";
import type { LibraryTrack, AlbumSummary } from "../../../types/library";

export const useLibraryActions = (fetchBrowserData: () => Promise<void>, tracks: LibraryTrack[]) => {
  const { playTrack, addToQueue } = usePlayback();
  const { addTracks: addToPlaylistCtx } = usePlaylist();
  const toast = useToast();
  const { start: startProgress, update: updateProgress, finish: finishProgress, fail: failProgress } = useProgress();
  const { bumpArtCache } = useArtCache();

  const handleFlagTracks = useCallback(
    async (trackIds: number[], flagged: boolean) => {
      try {
        await invoke("flag_tracks", { trackIds, flagged });
        await fetchBrowserData();
      } catch (e) {
        toast.error(`Failed to update sync flags: ${e}`);
      }
    },
    [fetchBrowserData, toast],
  );

  const handleRateTracks = useCallback(
    async (trackIds: number[], rating: number) => {
      try {
        await invoke("rate_tracks", { trackIds, rating });
        await fetchBrowserData();
      } catch (e) {
        toast.error(`Failed to update ratings: ${e}`);
      }
    },
    [fetchBrowserData, toast],
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
    async (track: LibraryTrack) => {
      if (!track.artist && !track.title) return;
      try {
        await invoke("fetch_lyrics", {
          trackId: track.id,
          artist: track.artist || "",
          title: track.title || track.file_name,
          album: track.album,
          durationSecs: track.duration_secs || null,
          filePath: track.file_path,
        });
        toast.success(`Lyrics fetched for "${track.title || track.file_name}"`);
      } catch {
        toast.error(`No lyrics found for "${track.title || track.file_name}"`);
      }
    },
    [toast],
  );

  const handleRemoveLyrics = useCallback(
    async (track: LibraryTrack) => {
      try {
        await invoke("save_lyrics", {
          trackId: track.id,
          plainLyrics: null,
          syncedLyrics: null,
        });
        toast.success(`Lyrics removed for "${track.title || track.file_name}"`);
      } catch (e) {
        toast.error(`Failed to remove lyrics: ${e}`);
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
    (action: { column: string; value: string }) => {
      return tracks.filter((t) => {
        switch (action.column) {
          case "genre":
            return t.genre === action.value;
          case "artist":
            return t.artist === action.value;
          case "album":
            return t.album === action.value;
          default:
            return false;
        }
      });
    },
    [tracks],
  );

  const handleColumnPlayAll = useCallback(
    (action: { column: string; value: string }) => {
      const matched = getTracksForColumnAction(action);
      if (matched.length > 0) playTrack(matched[0], matched);
    },
    [getTracksForColumnAction, playTrack],
  );

  const handleColumnAddToQueue = useCallback(
    (action: { column: string; value: string }) => {
      const matched = getTracksForColumnAction(action);
      if (matched.length > 0) addToQueue(matched);
    },
    [getTracksForColumnAction, addToQueue],
  );

  const handleColumnAddToPlaylist = useCallback(
    (action: { column: string; value: string }, playlistId: number) => {
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
