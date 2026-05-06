import { useState, useRef, useCallback, useEffect } from "react";
import { joinPath } from "./helpers";

interface CopyOperation {
  source_path: string;
  dest_path: string;
}

const buildOps = (paths: string[], targetDir: string): CopyOperation[] =>
  paths.map((srcPath) => {
    const fileName = srcPath.split("/").pop() ?? srcPath;
    return { source_path: srcPath, dest_path: joinPath(targetDir, fileName) };
  });

// ── Module-level pane registry ────────────────────────────────────
// Both panes register their state setters so the drag source can
// update visual feedback on the target pane during a mouse-based drag.
// This replaces the broken HTML5 DnD approach — Tauri's native
// drag-drop handler (dragDropEnabled: true) consumes the HTML5 `drop`
// event on macOS WKWebView, so we use mousedown/mousemove/mouseup instead.

interface PaneEntry {
  setIsDragOver: (v: boolean) => void;
  setDropTargetFolder: (v: string | null) => void;
  getPath: () => string;
  getOnDrop: () => (ops: CopyOperation[], isMove: boolean) => Promise<void>;
}

const paneRegistry = new Map<string, PaneEntry>();

// ── Drag overlay ──────────────────────────────────────────────────

let dragOverlay: HTMLDivElement | null = null;

const createOverlay = (count: number) => {
  const el = document.createElement("div");
  el.style.cssText =
    "position:fixed;z-index:9999;pointer-events:none;padding:4px 10px;border-radius:8px;background:rgba(40,40,40,0.92);color:#fff;font-size:12px;font-weight:500;white-space:nowrap;backdrop-filter:blur(4px);";
  el.textContent = `Copy ${count === 1 ? "1 item" : `${count} items`}`;
  document.body.appendChild(el);
  dragOverlay = el;
};

const updateOverlay = (x: number, y: number, altKey: boolean, count: number) => {
  if (!dragOverlay) return;
  dragOverlay.style.left = `${x + 14}px`;
  dragOverlay.style.top = `${y + 14}px`;
  dragOverlay.textContent = `${altKey ? "Move" : "Copy"} ${count === 1 ? "1 item" : `${count} items`}`;
};

const removeOverlay = () => {
  dragOverlay?.remove();
  dragOverlay = null;
};

// ── Hook ──────────────────────────────────────────────────────────

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
  const wasDraggingRef = useRef(false);

  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const currentPathRef = useRef(currentPath);
  currentPathRef.current = currentPath;

  // Register this pane in the module-level registry so other panes
  // can update our visual state and invoke our drop callback.
  useEffect(() => {
    if (!paneId) return;
    paneRegistry.set(paneId, {
      setIsDragOver,
      setDropTargetFolder,
      getPath: () => currentPathRef.current,
      getOnDrop: () => onDropRef.current,
    });
    return () => {
      paneRegistry.delete(paneId);
    };
  }, [paneId]);

  const rowMouseDown = useCallback(
    (e: React.MouseEvent, entryPath: string) => {
      if (!enabled || !paneId || e.button !== 0) return;

      const startX = e.clientX;
      const startY = e.clientY;
      const paths = selected.has(entryPath) ? [...selected] : [entryPath];
      let dragging = false;

      // Suppress text selection immediately — selectstart fires before
      // the browser begins highlighting, so this prevents the blue
      // selection flash during the pre-threshold mouse movement.
      const onSelectStart = (se: Event) => se.preventDefault();
      document.addEventListener("selectstart", onSelectStart);

      const findTarget = (cx: number, cy: number) => {
        const el = document.elementFromPoint?.(cx, cy);
        if (!el) return null;
        const paneEl = el.closest("[data-pane-id]");
        const targetPaneId = paneEl?.getAttribute("data-pane-id");
        if (!targetPaneId || targetPaneId === paneId) return null;
        const folderEl = el.closest("[data-drop-folder]");
        const folderPath = folderEl?.getAttribute("data-drop-folder") ?? null;
        return { paneId: targetPaneId, folderPath };
      };

      const clearHighlights = () => {
        for (const [id, entry] of paneRegistry) {
          if (id === paneId) continue;
          entry.setIsDragOver(false);
          entry.setDropTargetFolder(null);
        }
      };

      const cleanup = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.removeEventListener("keydown", onKeyDown);
        document.removeEventListener("selectstart", onSelectStart);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        removeOverlay();
        clearHighlights();
      };

      const onMove = (me: MouseEvent) => {
        if (!dragging) {
          if (Math.abs(me.clientX - startX) + Math.abs(me.clientY - startY) < 5) return;
          dragging = true;
          wasDraggingRef.current = true;
          createOverlay(paths.length);
          document.body.style.userSelect = "none";
          document.body.style.cursor = "grabbing";
        }

        updateOverlay(me.clientX, me.clientY, me.altKey, paths.length);

        // Update drop target highlights on other panes
        const target = findTarget(me.clientX, me.clientY);
        for (const [id, entry] of paneRegistry) {
          if (id === paneId) continue;
          if (target && id === target.paneId) {
            entry.setIsDragOver(true);
            entry.setDropTargetFolder(target.folderPath);
          } else {
            entry.setIsDragOver(false);
            entry.setDropTargetFolder(null);
          }
        }
      };

      const onUp = (ue: MouseEvent) => {
        cleanup();

        if (!dragging) {
          wasDraggingRef.current = false;
          return;
        }

        const target = findTarget(ue.clientX, ue.clientY);
        if (target) {
          const targetEntry = paneRegistry.get(target.paneId);
          if (targetEntry) {
            const targetDir = target.folderPath || targetEntry.getPath();
            const ops = buildOps(paths, targetDir);
            targetEntry
              .getOnDrop()(ops, ue.altKey)
              .catch((err) => console.error("Drop failed:", err));
          }
        }

        // Reset after any pending click events fire
        requestAnimationFrame(() => {
          wasDraggingRef.current = false;
        });
      };

      const onKeyDown = (ke: KeyboardEvent) => {
        if (ke.key === "Escape") {
          cleanup();
          dragging = false;
          requestAnimationFrame(() => {
            wasDraggingRef.current = false;
          });
        }
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.addEventListener("keydown", onKeyDown);
    },
    [enabled, paneId, selected],
  );

  return { rowMouseDown, isDragOver, dropTargetFolder, wasDragging: wasDraggingRef };
};
