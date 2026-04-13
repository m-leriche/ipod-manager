import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FileEntry, ClipboardState } from "./types";
import { joinPath, deduplicateName } from "./helpers";

export const useFileOperations = (currentPath: string, entries: FileEntry[], reload: () => void) => {
  const handleRename = useCallback(
    async (oldName: string, newName: string): Promise<boolean> => {
      if (!newName.trim() || newName === oldName) return false;
      try {
        await invoke("rename_entry", {
          oldPath: joinPath(currentPath, oldName),
          newPath: joinPath(currentPath, newName),
        });
        reload();
        return true;
      } catch (e) {
        window.alert(`Rename failed: ${e}`);
        return false;
      }
    },
    [currentPath, reload],
  );

  const handleCreateFolder = useCallback(
    async (name: string): Promise<boolean> => {
      if (!name.trim()) return false;
      try {
        await invoke("create_folder", { path: joinPath(currentPath, name) });
        reload();
        return true;
      } catch (e) {
        window.alert(`Create folder failed: ${e}`);
        return false;
      }
    },
    [currentPath, reload],
  );

  const handleDelete = useCallback(
    async (names: string[]) => {
      if (names.length === 0) return;
      const label = names.length === 1 ? `Delete "${names[0]}"?` : `Delete ${names.length} items?`;
      if (!window.confirm(label)) return;

      if (names.length === 1) {
        try {
          await invoke("delete_entry", { path: joinPath(currentPath, names[0]) });
        } catch (e) {
          window.alert(`Delete failed: ${e}`);
        }
      } else {
        try {
          await invoke("delete_files", {
            paths: names.map((n) => joinPath(currentPath, n)),
          });
        } catch (e) {
          window.alert(`Delete failed: ${e}`);
        }
      }
      reload();
    },
    [currentPath, reload],
  );

  const handlePaste = useCallback(
    async (clipboard: ClipboardState) => {
      const existingNames = new Set(entries.map((e) => e.name));
      const isSameDir = clipboard.sourceDir === currentPath;

      const operations = clipboard.paths.map((srcPath) => {
        const fileName = srcPath.split("/").pop() ?? srcPath;
        const destName = isSameDir ? deduplicateName(fileName, existingNames) : fileName;
        // Track used names to avoid collisions within the same paste batch
        existingNames.add(destName);
        return { source_path: srcPath, dest_path: joinPath(currentPath, destName) };
      });

      try {
        if (clipboard.operation === "copy") {
          await invoke("copy_files", { operations });
        } else {
          await invoke("move_files", { operations });
        }
      } catch (e) {
        window.alert(`Paste failed: ${e}`);
      }
      reload();
    },
    [currentPath, entries, reload],
  );

  return { handleRename, handleCreateFolder, handleDelete, handlePaste };
};
