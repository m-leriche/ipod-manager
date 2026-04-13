import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirm, message } from "@tauri-apps/plugin-dialog";
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
        await message(`Rename failed: ${e}`, { title: "Error", kind: "error" });
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
        await message(`Create folder failed: ${e}`, { title: "Error", kind: "error" });
        return false;
      }
    },
    [currentPath, reload],
  );

  const handleDelete = useCallback(
    async (names: string[]) => {
      if (names.length === 0) return;
      const label =
        names.length === 1
          ? `Are you sure you want to delete "${names[0]}"?`
          : `Are you sure you want to delete ${names.length} items?`;
      const ok = await confirm(label, { title: "Delete", kind: "warning", okLabel: "Delete", cancelLabel: "Cancel" });
      if (!ok) return;

      if (names.length === 1) {
        try {
          await invoke("delete_entry", { path: joinPath(currentPath, names[0]) });
        } catch (e) {
          await message(`Delete failed: ${e}`, { title: "Error", kind: "error" });
        }
      } else {
        try {
          await invoke("delete_files", {
            paths: names.map((n) => joinPath(currentPath, n)),
          });
        } catch (e) {
          await message(`Delete failed: ${e}`, { title: "Error", kind: "error" });
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
      const action = clipboard.operation === "copy" ? "copy" : "move";
      const count = clipboard.paths.length;
      const label =
        count === 1
          ? `${action === "copy" ? "Copy" : "Move"} "${clipboard.paths[0].split("/").pop()}" here?`
          : `${action === "copy" ? "Copy" : "Move"} ${count} items here?`;
      const ok = await confirm(label, { title: "Paste", okLabel: "OK", cancelLabel: "Cancel" });
      if (!ok) return;

      const operations = clipboard.paths.map((srcPath) => {
        const fileName = srcPath.split("/").pop() ?? srcPath;
        const destName = isSameDir ? deduplicateName(fileName, existingNames) : fileName;
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
        await message(`Paste failed: ${e}`, { title: "Error", kind: "error" });
      }
      reload();
    },
    [currentPath, entries, reload],
  );

  return { handleRename, handleCreateFolder, handleDelete, handlePaste };
};
