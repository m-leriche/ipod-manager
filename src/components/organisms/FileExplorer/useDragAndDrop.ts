import { useState, useRef, useCallback, useEffect } from "react";
import type { FileEntry, DragTransferData } from "./types";
import { joinPath } from "./helpers";

// Module-level: tracks which pane started the drag.
// HTML5 spec blocks getData() during dragover, so we use this instead.
let activeDragPaneId: string | null = null;

interface CopyOperation {
  source_path: string;
  dest_path: string;
}

interface UseDragAndDropConfig {
  paneId?: string;
  currentPath: string;
  selected: Set<string>;
  onDrop: (operations: CopyOperation[], isMove: boolean) => Promise<void>;
}

export const useDragAndDrop = ({ paneId, currentPath, selected, onDrop }: UseDragAndDropConfig) => {
  const enabled = !!paneId;
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropTargetFolder, setDropTargetFolder] = useState<string | null>(null);
  const enterCount = useRef(0);
  const folderEnterCount = useRef(0);

  // Reset module variable on dragend
  useEffect(() => {
    const onDragEnd = () => {
      activeDragPaneId = null;
    };
    document.addEventListener("dragend", onDragEnd);
    return () => document.removeEventListener("dragend", onDragEnd);
  }, []);

  const rowDragStart = useCallback(
    (e: React.DragEvent, entry: FileEntry) => {
      if (!enabled || !paneId) return;
      activeDragPaneId = paneId;

      // Drag all selected if entry is in selection, otherwise just the one
      const paths = selected.has(entry.name)
        ? [...selected].map((name) => joinPath(currentPath, name))
        : [joinPath(currentPath, entry.name)];

      const data: DragTransferData = { paneId, paths, sourceDir: currentPath };
      e.dataTransfer.setData("application/json", JSON.stringify(data));
      e.dataTransfer.effectAllowed = "copyMove";

      // Multi-file drag image
      if (paths.length > 1) {
        const badge = document.createElement("div");
        badge.textContent = `${paths.length} items`;
        badge.style.cssText =
          "position:fixed;top:-100px;left:-100px;padding:4px 10px;border-radius:8px;background:#333;color:#fff;font-size:12px;font-weight:500;white-space:nowrap;";
        document.body.appendChild(badge);
        e.dataTransfer.setDragImage(badge, 0, 0);
        requestAnimationFrame(() => badge.remove());
      }
    },
    [enabled, paneId, currentPath, selected],
  );

  const buildOperations = useCallback(
    (data: DragTransferData, targetDir: string): CopyOperation[] =>
      data.paths.map((srcPath) => {
        const fileName = srcPath.split("/").pop() ?? srcPath;
        return { source_path: srcPath, dest_path: joinPath(targetDir, fileName) };
      }),
    [],
  );

  const isValidDrop = useCallback(
    () => enabled && activeDragPaneId !== null && activeDragPaneId !== paneId,
    [enabled, paneId],
  );

  // ── Container handlers ─────────────────────────────────────────

  const containerDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!isValidDrop()) return;
      enterCount.current++;
      setIsDragOver(true);
    },
    [isValidDrop],
  );

  const containerDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!isValidDrop()) return;
      e.dataTransfer.dropEffect = e.altKey ? "move" : "copy";
    },
    [isValidDrop],
  );

  const containerDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    enterCount.current--;
    if (enterCount.current <= 0) {
      enterCount.current = 0;
      setIsDragOver(false);
      setDropTargetFolder(null);
    }
  }, []);

  const containerDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      enterCount.current = 0;
      setIsDragOver(false);
      setDropTargetFolder(null);

      if (!isValidDrop()) return;
      try {
        const data: DragTransferData = JSON.parse(e.dataTransfer.getData("application/json"));
        if (data.paneId === paneId) return;
        const operations = buildOperations(data, currentPath);
        await onDrop(operations, e.altKey);
      } catch {
        // Invalid drag data — ignore
      }
    },
    [isValidDrop, paneId, currentPath, buildOperations, onDrop],
  );

  const containerHandlers = {
    onDragEnter: containerDragEnter,
    onDragOver: containerDragOver,
    onDragLeave: containerDragLeave,
    onDrop: containerDrop,
  };

  // ── Folder row handlers ────────────────────────────────────────

  const folderHandlers = useCallback(
    (entry: FileEntry) => {
      const folderPath = joinPath(currentPath, entry.name);
      return {
        onDragEnter: (e: React.DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          if (!isValidDrop()) return;
          folderEnterCount.current++;
          setDropTargetFolder(folderPath);
        },
        onDragOver: (e: React.DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          if (!isValidDrop()) return;
          e.dataTransfer.dropEffect = e.altKey ? "move" : "copy";
        },
        onDragLeave: (e: React.DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          folderEnterCount.current--;
          if (folderEnterCount.current <= 0) {
            folderEnterCount.current = 0;
            setDropTargetFolder(null);
          }
        },
        onDrop: async (e: React.DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          folderEnterCount.current = 0;
          enterCount.current = 0;
          setIsDragOver(false);
          setDropTargetFolder(null);

          if (!isValidDrop()) return;
          try {
            const data: DragTransferData = JSON.parse(e.dataTransfer.getData("application/json"));
            if (data.paneId === paneId) return;
            const operations = buildOperations(data, folderPath);
            await onDrop(operations, e.altKey);
          } catch {
            // Invalid drag data — ignore
          }
        },
      };
    },
    [currentPath, isValidDrop, paneId, buildOperations, onDrop],
  );

  return { rowDragStart, containerHandlers, isDragOver, dropTargetFolder, folderHandlers };
};
