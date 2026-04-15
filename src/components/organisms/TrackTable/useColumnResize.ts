import { useState, useCallback, useRef } from "react";

export interface ColumnDef {
  key: string;
  minWidth: number;
  initialWidth: number;
}

export const useColumnResize = (columns: ColumnDef[]) => {
  const [widths, setWidths] = useState<number[]>(() => columns.map((c) => c.initialWidth));
  const draggingRef = useRef(false);
  const didDragRef = useRef(false);

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
