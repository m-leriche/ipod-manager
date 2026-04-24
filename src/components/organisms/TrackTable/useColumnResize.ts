import { useState, useCallback, useRef, useEffect, useMemo } from "react";

export interface ColumnDef {
  key: string;
  minWidth: number;
  initialWidth: number;
}

const STORAGE_KEY = "crate-column-widths";

const loadWidthMap = (columns: ColumnDef[]): Record<string, number> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const map: Record<string, number> = {};
      columns.forEach((c) => {
        map[c.key] = c.initialWidth;
      });
      return map;
    }
    const saved = JSON.parse(raw) as Record<string, number>;
    const map: Record<string, number> = {};
    columns.forEach((c) => {
      map[c.key] = saved[c.key] ?? c.initialWidth;
    });
    return map;
  } catch {
    const map: Record<string, number> = {};
    columns.forEach((c) => {
      map[c.key] = c.initialWidth;
    });
    return map;
  }
};

export const useColumnResize = (columns: ColumnDef[]) => {
  const [widthMap, setWidthMap] = useState<Record<string, number>>(() => loadWidthMap(columns));
  const draggingRef = useRef(false);
  const didDragRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widthMap));
  }, [widthMap]);

  const widths = useMemo(() => columns.map((c) => widthMap[c.key] ?? c.initialWidth), [columns, widthMap]);

  const onResizeStart = useCallback(
    (colIndex: number, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const col = columns[colIndex];
      const startX = e.clientX;
      const startWidth = widthMap[col.key] ?? col.initialWidth;
      draggingRef.current = true;
      didDragRef.current = false;

      const onMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        didDragRef.current = true;
        const delta = ev.clientX - startX;
        const newWidth = Math.max(col.minWidth, startWidth + delta);
        setWidthMap((prev) => ({ ...prev, [col.key]: newWidth }));
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
    [widthMap, columns],
  );

  return { widths, onResizeStart };
};
