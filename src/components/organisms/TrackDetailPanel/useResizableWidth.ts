import { useState, useCallback, useRef } from "react";
import { getSetting, setSetting } from "../../../utils/settings";

const MIN_WIDTH = 180;
const MAX_WIDTH = 500;

const loadWidth = (): number => {
  const w = getSetting("detailPanelWidth");
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w));
};

export const useResizableWidth = () => {
  const [width, setWidth] = useState(loadWidth);
  const draggingRef = useRef(false);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;
      draggingRef.current = true;

      const onMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        // Dragging left edge: moving mouse left = wider, right = narrower
        const delta = startX - ev.clientX;
        const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta));
        setWidth(newWidth);
      };

      const onUp = () => {
        draggingRef.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        // Persist on release
        setWidth((w) => {
          setSetting("detailPanelWidth", w);
          return w;
        });
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [width],
  );

  return { width, onDragStart };
};
