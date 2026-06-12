import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "../../../contexts/ToastContext";
import { useUndo } from "../../../contexts/UndoContext";
import { albumLabel } from "./helpers";
import type { FileAwayResult, FileMove, InboxAlbum } from "./types";

export const useInboxActions = (removeAlbums: (folderPaths: string[]) => void) => {
  const [filing, setFiling] = useState(false);
  const toast = useToast();
  const { push } = useUndo();

  const fileAlbums = useCallback(
    async (albums: InboxAlbum[], label: string) => {
      if (albums.length === 0) return;
      setFiling(true);
      const moves: FileMove[] = [];
      const errors: string[] = [];
      const filed: string[] = [];
      try {
        for (const album of albums) {
          try {
            const result = await invoke<FileAwayResult>("file_inbox_album", {
              folderPath: album.folder_path,
            });
            moves.push(...result.moves);
            errors.push(...result.errors);
            if (result.moves.length > 0) filed.push(album.folder_path);
          } catch (e) {
            errors.push(String(e));
          }
        }
        if (filed.length > 0) {
          removeAlbums(filed);
          push({ label, undo: () => invoke<void>("undo_inbox_filing", { moves }) });
        }
        if (errors.length > 0) {
          toast.warning(`${label}: ${errors.length} issue(s) — ${errors[0]}`);
        } else if (filed.length > 0) {
          toast.success(`${label} — ⌘Z to undo`);
        }
      } finally {
        setFiling(false);
      }
    },
    [push, removeAlbums, toast],
  );

  const fileAway = useCallback(
    (album: InboxAlbum) => fileAlbums([album], `File away ${albumLabel(album)}`),
    [fileAlbums],
  );

  const fileAll = useCallback(
    (albums: InboxAlbum[]) =>
      fileAlbums(
        albums,
        albums.length === 1 ? `File away ${albumLabel(albums[0])}` : `File away ${albums.length} albums`,
      ),
    [fileAlbums],
  );

  return { fileAway, fileAll, filing };
};
