import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { getSetting, setSetting } from "../../../utils/settings";

export interface ColumnDef {
  key: string;
  minWidth: number;
  initialWidth: number;
}

const loadWidthMap = (columns: ColumnDef[]): Record<string, number> => {
  const saved = getSetting("columnWidths");
  const map: Record<string, number> = {};
  columns.forEach((c) => {
    map[c.key] =
      (saved && typeof saved === "object" ? (saved as Record<string, number>)[c.key] : undefined) ?? c.initialWidth;
  });
  return map;
};

export const useColumnResize = (columns: ColumnDef[]) => {
  const [widthMap, setWidthMap] = useState<Record<string, number>>(() => loadWidthMap(columns));
  const draggingRef = useRef(false);
  const didDragRef = useRef(false);

  useEffect(() => {
    // Merge into the stored map instead of replacing it: `columns` holds only
    // the *visible* columns, and a plain overwrite would delete every hidden
    // column's saved width on mount.
    const saved = getSetting("columnWidths");
    const base = saved && typeof saved === "object" ? (saved as Record<string, number>) : {};
    setSetting("columnWidths", { ...base, ...widthMap });
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
