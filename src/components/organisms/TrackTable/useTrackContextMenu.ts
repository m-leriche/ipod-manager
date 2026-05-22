import { useMemo } from "react";
import { usePlayback } from "../../../contexts/PlaybackContext";
import { usePlaylist } from "../../../contexts/PlaylistContext";
import { getAlbumTracks, getContextIds } from "./helpers";
import type { LibraryTrack } from "../../../types/library";
import type { ContextMenuState } from "./types";

interface UseTrackContextMenuOptions {
  tracks: LibraryTrack[];
  selected: Set<number>;
  contextMenu: ContextMenuState | null;
  activePlaylistId?: number | null;
  onFlagTracks?: (trackIds: number[], flagged: boolean) => void;
  onRateTracks?: (trackIds: number[], rating: number) => void;
  onRepairAlbumArt?: (tracks: LibraryTrack[]) => void;
  onRepairAllAlbumArt?: () => void;
  isRepairingAllArt?: boolean;
  onFetchLyrics?: (tracks: LibraryTrack[]) => void;
  onRemoveLyrics?: (tracks: LibraryTrack[]) => void;
  onFetchAllLyrics?: () => void;
  isFetchingAllLyrics?: boolean;
  onRepairMetadata?: (tracks: LibraryTrack[]) => void;
  onClose: () => void;
  onDeleteRequest: (ids: number[]) => void;
}

export const useTrackContextMenu = ({
  tracks,
  selected,
  contextMenu,
  activePlaylistId,
  onFlagTracks,
  onRateTracks,
  onRepairAlbumArt,
  onRepairAllAlbumArt,
  isRepairingAllArt,
  onFetchLyrics,
  onRemoveLyrics,
  onFetchAllLyrics,
  isFetchingAllLyrics,
  onRepairMetadata,
  onClose,
  onDeleteRequest,
}: UseTrackContextMenuOptions) => {
  const { playTrack, playNext, addToQueue } = usePlayback();
  const { playlists, addTracks: addToPlaylist, removeTracks: removeFromPlaylist } = usePlaylist();

  return useMemo(() => {
    if (!contextMenu) return [];

    const ids = getContextIds(contextMenu.track.id, selected);
    const isMulti = ids.length > 1;

    return [
      {
        label: "Play",
        onClick: () => {
          playTrack(contextMenu.track, getAlbumTracks(contextMenu.track, tracks));
          onClose();
        },
      },
      {
        label: "Play Next",
        onClick: () => {
          playNext([contextMenu.track]);
          onClose();
        },
      },
      {
        label: "Add to Queue",
        onClick: () => {
          addToQueue([contextMenu.track]);
          onClose();
        },
      },
      ...(playlists.length > 0
        ? [
            {
              type: "submenu" as const,
              label: "Add to Playlist",
              children: playlists.map((p) => ({
                label: p.name,
                onClick: () => {
                  addToPlaylist(p.id, ids);
                  onClose();
                },
              })),
            },
          ]
        : []),
      ...(activePlaylistId != null
        ? [
            {
              label: isMulti ? `Remove ${ids.length} from Playlist` : "Remove from Playlist",
              onClick: () => {
                removeFromPlaylist(activePlaylistId, ids);
                onClose();
              },
            },
          ]
        : []),
      { type: "separator" as const },
      {
        label: (() => {
          const relevant = tracks.filter((t) => ids.includes(t.id));
          const allFlagged = relevant.every((t) => t.flagged);
          if (isMulti) {
            return allFlagged ? `Remove ${ids.length} Tracks from Sync List` : `Add ${ids.length} Tracks to Sync List`;
          }
          return allFlagged ? "Remove from Sync List" : "Add to Sync List";
        })(),
        onClick: () => {
          const relevant = tracks.filter((t) => ids.includes(t.id));
          const allFlagged = relevant.every((t) => t.flagged);
          onFlagTracks?.(ids, !allFlagged);
          onClose();
        },
      },
      ...(onRateTracks
        ? [
            {
              type: "submenu" as const,
              label: "Rate",
              children: [
                ...[5, 4, 3, 2, 1].map((r) => ({
                  label: "\u2605".repeat(r),
                  onClick: () => {
                    onRateTracks(ids, r);
                    onClose();
                  },
                })),
                { type: "separator" as const },
                {
                  label: "No Rating",
                  onClick: () => {
                    onRateTracks(ids, 0);
                    onClose();
                  },
                },
              ],
            },
          ]
        : []),
      ...(onRepairAlbumArt
        ? [
            {
              label: (() => {
                const folderCount = new Set(tracks.filter((t) => ids.includes(t.id)).map((t) => t.folder_path)).size;
                return folderCount > 1 ? `Find & Repair Album Art (${folderCount} albums)` : "Find & Repair Album Art";
              })(),
              onClick: () => {
                onRepairAlbumArt(tracks.filter((t) => ids.includes(t.id)));
                onClose();
              },
            },
          ]
        : []),
      ...(onRepairAllAlbumArt
        ? [
            {
              label: "Find & Repair Art for Entire Library",
              onClick: () => {
                onRepairAllAlbumArt();
                onClose();
              },
              disabled: isRepairingAllArt,
            },
          ]
        : []),
      ...(onFetchLyrics
        ? [
            {
              label: isMulti ? `Fetch Lyrics for ${ids.length} Tracks` : "Fetch Lyrics",
              onClick: () => {
                onFetchLyrics(tracks.filter((t) => ids.includes(t.id)));
                onClose();
              },
            },
          ]
        : []),
      ...(onRemoveLyrics
        ? [
            {
              label: isMulti ? `Remove Lyrics from ${ids.length} Tracks` : "Remove Lyrics",
              onClick: () => {
                onRemoveLyrics(tracks.filter((t) => ids.includes(t.id)));
                onClose();
              },
            },
          ]
        : []),
      ...(onFetchAllLyrics
        ? [
            {
              label: "Fetch Lyrics for Entire Library",
              onClick: () => {
                onFetchAllLyrics();
                onClose();
              },
              disabled: isFetchingAllLyrics,
            },
          ]
        : []),
      ...(onRepairMetadata
        ? [
            {
              label: isMulti ? `Repair Metadata for ${ids.length} Tracks` : "Repair Metadata",
              onClick: () => {
                onRepairMetadata(tracks.filter((t) => ids.includes(t.id)));
                onClose();
              },
            },
          ]
        : []),
      { type: "separator" as const },
      {
        label: isMulti ? `Delete ${ids.length} Tracks from Library` : "Delete from Library",
        onClick: () => {
          onDeleteRequest(ids);
          onClose();
        },
      },
    ];
  }, [
    contextMenu,
    tracks,
    selected,
    activePlaylistId,
    playlists,
    playTrack,
    playNext,
    addToQueue,
    addToPlaylist,
    removeFromPlaylist,
    onFlagTracks,
    onRateTracks,
    onRepairAlbumArt,
    onRepairAllAlbumArt,
    isRepairingAllArt,
    onFetchLyrics,
    onRemoveLyrics,
    onFetchAllLyrics,
    isFetchingAllLyrics,
    onRepairMetadata,
    onClose,
    onDeleteRequest,
  ]);
};
