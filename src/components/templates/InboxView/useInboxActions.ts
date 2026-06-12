import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useProgress } from "../../../contexts/ProgressContext";
import { useToast } from "../../../contexts/ToastContext";
import { useUndo } from "../../../contexts/UndoContext";
import { cancelSync } from "../../../utils/cancelSync";
import type { ConvertResult } from "../AudioConverter/types";
import { albumLabel } from "./helpers";
import type { ConvertProgress, ConvertTarget, FileAwayResult, FileMove, InboxAlbum } from "./types";

export const useInboxActions = (removeAlbums: (folderPaths: string[]) => void, rescan: () => Promise<void>) => {
  const [filing, setFiling] = useState(false);
  const [converting, setConverting] = useState(false);
  const toast = useToast();
  const { push } = useUndo();
  const { start: startProgress, update: updateProgress, finish: finishProgress, fail: failProgress } = useProgress();

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

  const convertAlbum = useCallback(
    async (album: InboxAlbum, target: ConvertTarget) => {
      setConverting(true);
      startProgress(`Converting ${albumLabel(album)}…`, cancelSync);
      const unlisten = await listen<ConvertProgress>("convert-progress", (e) => {
        updateProgress(e.payload.file_index, e.payload.total_files, e.payload.current_file);
      });
      try {
        const result = await invoke<ConvertResult>("convert_inbox_album", {
          folderPath: album.folder_path,
          targetFormat: target.target_format,
          sampleRate: target.sample_rate,
          bitDepth: target.bit_depth,
          mp3Bitrate: target.mp3_bitrate,
        });
        if (result.cancelled) {
          finishProgress("Conversion cancelled");
        } else if (result.errors.length > 0) {
          failProgress(`Converted with issues: ${result.errors[0]}`);
        } else {
          finishProgress(`Converted ${result.converted} file(s) to ${target.label}`);
        }
      } catch (e) {
        failProgress(`Convert failed: ${e}`);
      } finally {
        unlisten();
        setConverting(false);
        void rescan();
      }
    },
    [startProgress, updateProgress, finishProgress, failProgress, rescan],
  );

  return { fileAway, fileAll, convertAlbum, busy: filing || converting };
};
