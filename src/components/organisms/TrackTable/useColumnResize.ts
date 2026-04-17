import { useState, useCallback, useRef, useEffect } from "react";

export interface ColumnDef {
  key: string;
  minWidth: number;
  initialWidth: number;
}

const STORAGE_KEY = "crate-column-widths";

const loadWidths = (columns: ColumnDef[]): number[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return columns.map((c) => c.initialWidth);
    const saved = JSON.parse(raw) as Record<string, number>;
    return columns.map((c) => saved[c.key] ?? c.initialWidth);
  } catch {
    return columns.map((c) => c.initialWidth);
  }
};

const saveWidths = (columns: ColumnDef[], widths: number[]) => {
  const map: Record<string, number> = {};
  columns.forEach((c, i) => {
    map[c.key] = widths[i];
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
};

export const useColumnResize = (columns: ColumnDef[]) => {
  const [widths, setWidths] = useState<number[]>(() => loadWidths(columns));
  const draggingRef = useRef(false);
  const didDragRef = useRef(false);

  // Persist widths to localStorage when they change
  useEffect(() => {
    saveWidths(columns, widths);
  }, [columns, widths]);

  const onResizeStart = useCallback(
    (colIndex: number, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = widths[colIndex];
      draggingRef.current = true;
      didDragRef.current = false;

      const onMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        didDragRef.current = true;
        const delta = ev.clientX - startX;
        const newWidth = Math.max(columns[colIndex].minWidth, startWidth + delta);
        setWidths((prev) => {
          const next = [...prev];
          next[colIndex] = newWidth;
          return next;
        });
      };

      const onUp = () => {
        draggingRef.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);

        // Suppress the click event that follows mouseup so it doesn't trigger sort
        if (didDragRef.current) {
          const suppress = (ev: MouseEvent) => {
            ev.stopPropagation();
            ev.preventDefault();
          };
          // Capture phase so we catch it before the th onClick
          window.addEventListener("click", suppress, { capture: true, once: true });
        }
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [widths, columns],
  );

  return { widths, onResizeStart };
};
