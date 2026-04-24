import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { TrackTableColumn } from "./constants";

const STORAGE_KEY = "crate-column-order";

const loadOrder = (columns: TrackTableColumn[]): string[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return columns.map((c) => c.key);
    const saved = JSON.parse(raw) as string[];
    const defaultKeys = new Set(columns.map((c) => c.key));
    if (saved.length !== defaultKeys.size || !saved.every((k) => defaultKeys.has(k))) {
      return columns.map((c) => c.key);
    }
    return saved;
  } catch {
    return columns.map((c) => c.key);
  }
};

interface DragState {
  fromIndex: number;
  overIndex: number;
}

const DRAG_THRESHOLD = 5;

export const useColumnOrder = (columns: TrackTableColumn[]) => {
  const [order, setOrder] = useState<string[]>(() => loadOrder(columns));
  const [dragState, setDragState] = useState<DragState | null>(null);
  const headerEls = useRef<(HTMLTableCellElement | null)[]>([]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  }, [order]);

  const orderedColumns = useMemo(() => {
    const map = new Map(columns.map((c) => [c.key, c]));
    return order.map((key) => map.get(key)!).filter(Boolean);
  }, [columns, order]);

  const setHeaderRef = useCallback((index: number, el: HTMLTableCellElement | null) => {
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
          setOrder((prev) => {
            const next = [...prev];
            const [item] = next.splice(colIndex, 1);
            next.splice(currentOverIndex, 0, item);
            return next;
          });
        }
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const dragIndex = dragState?.fromIndex ?? null;
  const dragOverIndex = dragState?.overIndex ?? null;

  return { orderedColumns, dragIndex, dragOverIndex, setHeaderRef, onReorderStart };
};
