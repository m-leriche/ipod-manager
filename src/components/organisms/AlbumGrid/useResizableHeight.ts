import { useState, useCallback, useRef } from "react";

const DEFAULT_STORAGE_KEY = "crate-album-grid-height";
const DEFAULT_FRACTION = 0.4;
const DEFAULT_MIN = 0.2;
const DEFAULT_MAX = 0.75;

interface ResizableHeightOptions {
  storageKey?: string;
  defaultFraction?: number;
  minFraction?: number;
  maxFraction?: number;
}

const loadFraction = (storageKey: string, defaultFraction: number, min: number, max: number): number => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaultFraction;
    const f = parseFloat(raw);
    return isFinite(f) ? Math.max(min, Math.min(max, f)) : defaultFraction;
  } catch {
    return defaultFraction;
  }
};

export const useResizableHeight = (options?: ResizableHeightOptions) => {
  const storageKey = options?.storageKey ?? DEFAULT_STORAGE_KEY;
  const minFraction = options?.minFraction ?? DEFAULT_MIN;
  const maxFraction = options?.maxFraction ?? DEFAULT_MAX;

  const [fraction, setFraction] = useState(() =>
    loadFraction(storageKey, options?.defaultFraction ?? DEFAULT_FRACTION, minFraction, maxFraction),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startFraction = fraction;
      draggingRef.current = true;

      const onMove = (ev: MouseEvent) => {
        if (!draggingRef.current || !containerRef.current) return;
        const parent = containerRef.current.parentElement;
        if (!parent) return;
        const parentHeight = parent.getBoundingClientRect().height;
        const delta = (ev.clientY - startY) / parentHeight;
        const newFraction = Math.max(minFraction, Math.min(maxFraction, startFraction + delta));
        setFraction(newFraction);
      };

      const onUp = () => {
        draggingRef.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        setFraction((f) => {
          localStorage.setItem(storageKey, String(f));
          return f;
        });
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [fraction, storageKey, minFraction, maxFraction],
  );

  return { fraction, containerRef, onDragStart };
};
