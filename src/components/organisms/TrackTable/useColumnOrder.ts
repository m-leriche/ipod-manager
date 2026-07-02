import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { TrackTableColumn } from "./constants";
import { getSetting, setSetting } from "../../../utils/settings";

const loadOrder = (columns: TrackTableColumn[]): string[] => {
  const defaults = columns.map((c) => c.key);
  const saved = getSetting("columnOrder");
  if (!Array.isArray(saved) || saved.length === 0) return defaults;
  // Merge: keep the user's order for keys that still exist, and append any
  // columns added since the order was saved (instead of resetting it).
  const known = new Set(defaults);
  // De-dupe defensively — a corrupted saved order would otherwise render a
  // column twice (duplicate React keys, shifted widths) forever, since the
  // merge result is re-persisted.
  const kept = [...new Set(saved)].filter((k) => known.has(k));
  const keptSet = new Set(kept);
  return [...kept, ...defaults.filter((k) => !keptSet.has(k))];
};

interface DragState {
  fromIndex: number;
  overIndex: number;
}

const DRAG_THRESHOLD = 5;

/** Column order (all columns, persisted) plus drag-to-reorder over the
    currently *visible* columns — drag indices refer to rendered headers. */
export const useColumnOrder = (columns: TrackTableColumn[], visibleKeys?: Set<string>) => {
  const [order, setOrder] = useState<string[]>(() => loadOrder(columns));
  const [dragState, setDragState] = useState<DragState | null>(null);
  const headerEls = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    setSetting("columnOrder", order);
  }, [order]);

  const orderedColumns = useMemo(() => {
    const map = new Map(columns.map((c) => [c.key, c]));
    return order.map((key) => map.get(key)!).filter(Boolean);
  }, [columns, order]);

  const visibleColumns = useMemo(
    () => (visibleKeys ? orderedColumns.filter((c) => visibleKeys.has(c.key)) : orderedColumns),
    [orderedColumns, visibleKeys],
  );

  // Rendered header keys, for translating drag indices to order positions at
  // drop time (the drag handlers are attached once and must not go stale).
  const renderedKeysRef = useRef<string[]>([]);
  renderedKeysRef.current = visibleColumns.map((c) => c.key);

  const setHeaderRef = useCallback((index: number, el: HTMLElement | null) => {
    headerEls.current[index] = el;
  }, []);

  const onReorderStart = useCallback((colIndex: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();

    const startX = e.clientX;
    let moved = false;
    let currentOverIndex = colIndex;

    const onMove = (ev: MouseEvent) => {
      if (!moved && Math.abs(ev.clientX - startX) < DRAG_THRESHOLD) return;

      if (!moved) {
        moved = true;
        setDragState({ fromIndex: colIndex, overIndex: colIndex });
      }

      const targetIndex = headerEls.current.findIndex((el) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return ev.clientX >= rect.left && ev.clientX <= rect.right;
      });
      if (targetIndex >= 0 && targetIndex !== currentOverIndex) {
        currentOverIndex = targetIndex;
        setDragState({ fromIndex: colIndex, overIndex: targetIndex });
      }
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setDragState(null);

      if (moved) {
        // Suppress the click so it doesn't trigger sort
        const suppress = (ev: MouseEvent) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        window.addEventListener("click", suppress, { capture: true, once: true });

        if (colIndex !== currentOverIndex) {
          // Indices are into the visible headers; hidden columns keep their
          // slot in the full order.
          const fromKey = renderedKeysRef.current[colIndex];
          const toKey = renderedKeysRef.current[currentOverIndex];
          if (fromKey !== undefined && toKey !== undefined && fromKey !== toKey) {
            setOrder((prev) => {
              const next = prev.filter((k) => k !== fromKey);
              const toPos = next.indexOf(toKey);
              if (toPos < 0) return prev;
              next.splice(colIndex < currentOverIndex ? toPos + 1 : toPos, 0, fromKey);
              return next;
            });
          }
        }
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const dragIndex = dragState?.fromIndex ?? null;
  const dragOverIndex = dragState?.overIndex ?? null;

  return { orderedColumns, visibleColumns, dragIndex, dragOverIndex, setHeaderRef, onReorderStart };
};
