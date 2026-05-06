import { useState, useRef, useCallback, useEffect } from "react";
import type { DragTransferData } from "./types";
import { joinPath } from "./helpers";

// ── Module-level shared state ────────────────────────────────────
// Both panes live in the same page. Tauri's native drag-drop handler
// (dragDropEnabled: true) consumes the HTML5 `drop` event on macOS
// WKWebView, so we bypass it entirely. Data flows through module vars
// and the operation is triggered by `dragend` on the source element.
let activeDragPaneId: string | null = null;
let activeDragData: DragTransferData | null = null;
let pendingDrop: {
  targetDir: string;
  onDrop: (operations: CopyOperation[], isMove: boolean) => Promise<void>;
} | null = null;
let lastDragOverTime = 0;

interface CopyOperation {
  source_path: string;
  dest_path: string;
}

const buildOps = (data: DragTransferData, targetDir: string): CopyOperation[] =>
  data.paths.map((srcPath) => {
    const fileName = srcPath.split("/").pop() ?? srcPath;
    return { source_path: srcPath, dest_path: joinPath(targetDir, fileName) };
  });

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

  // Keep a ref to onDrop so the dragend listener always uses the latest
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const currentPathRef = useRef(currentPath);
  currentPathRef.current = currentPath;

  // dragend fires on the source AFTER the drag ends — use it to trigger the copy
  // since Tauri's native handler may consume the `drop` event.
  // We use lastDragOverTime to detect if the cursor was over a valid target
  // when the drag ended — dragleave fires before dragend when the native handler
  // consumes the drop, so we can't rely on pendingDrop surviving.
  useEffect(() => {
    const handleDragEnd = (event: DragEvent) => {
      const data = activeDragData;
      const drop = pendingDrop;
      const recentlyOverTarget = Date.now() - lastDragOverTime < 300;

      // Clean up module state
      activeDragPaneId = null;
      activeDragData = null;
      pendingDrop = null;
      lastDragOverTime = 0;

      if (!data || !drop) return;
      // Only execute if cursor was recently over a valid target
      if (!recentlyOverTarget) return;

      const operations = buildOps(data, drop.targetDir);
      drop.onDrop(operations, event.altKey).catch((err) => console.error("Drop failed:", err));
    };
    document.addEventListener("dragend", handleDragEnd);
    return () => document.removeEventListener("dragend", handleDragEnd);
  }, []);

  const rowDragStart = useCallback(
    (e: React.DragEvent, entryPath: string) => {
      if (!enabled || !paneId) return;

      const paths = selected.has(entryPath) ? [...selected] : [entryPath];

      activeDragPaneId = paneId;
      activeDragData = { paneId, paths, sourceDir: currentPath };
      pendingDrop = null;

      e.dataTransfer.effectAllowed = "copyMove";
      e.dataTransfer.setData("text/plain", paths.join("\n"));

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
      // Track this pane as the pending drop target
      pendingDrop = { targetDir: currentPathRef.current, onDrop: onDropRef.current };
      lastDragOverTime = Date.now();
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
      // Don't clear pendingDrop here — dragleave fires before dragend when
      // Tauri's native handler consumes the drop event. The dragend handler
      // uses lastDragOverTime to check if drop was recent.
    }
  }, []);

  const containerDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      enterCount.current = 0;
      setIsDragOver(false);
      setDropTargetFolder(null);

      // If the drop event fires (not consumed by Tauri), handle it here
      // and clear pendingDrop so dragend doesn't duplicate.
      const data = activeDragData;
      if (!isValidDrop() || !data) {
        pendingDrop = null;
        return;
      }
      if (data.paneId === paneId) {
        pendingDrop = null;
        return;
      }

      const operations = buildOps(data, currentPath);
      activeDragData = null;
      activeDragPaneId = null;
      pendingDrop = null;
      lastDragOverTime = 0;

      try {
        await onDrop(operations, e.altKey);
      } catch (err) {
        console.error("Drop failed:", err);
      }
    },
    [isValidDrop, paneId, currentPath, onDrop],
  );

  const containerHandlers = {
    onDragEnter: containerDragEnter,
    onDragOver: containerDragOver,
    onDragLeave: containerDragLeave,
    onDrop: containerDrop,
  };

  // ── Folder row handlers ────────────────────────────────────────

  const folderHandlers = useCallback(
    (folderPath: string) => {
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
          // Track this folder as the pending drop target
          pendingDrop = { targetDir: folderPath, onDrop: onDropRef.current };
          lastDragOverTime = Date.now();
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

          // Same as container: handle here if event fires, clear to prevent duplicate
          const data = activeDragData;
          if (!isValidDrop() || !data) {
            pendingDrop = null;
            return;
          }
          if (data.paneId === paneId) {
            pendingDrop = null;
            return;
          }

          const operations = buildOps(data, folderPath);
          activeDragData = null;
          activeDragPaneId = null;
          pendingDrop = null;
          lastDragOverTime = 0;

          try {
            await onDrop(operations, e.altKey);
          } catch (err) {
            console.error("Folder drop failed:", err);
          }
        },
      };
    },
    [isValidDrop, paneId, onDrop],
  );

  return { rowDragStart, containerHandlers, isDragOver, dropTargetFolder, folderHandlers };
};
