import { useState, useCallback, useRef } from "react";

const STORAGE_KEY = "crate-album-grid-height";
const DEFAULT_FRACTION = 0.4;
const MIN_FRACTION = 0.2;
const MAX_FRACTION = 0.75;

const loadFraction = (): number => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FRACTION;
    const f = parseFloat(raw);
    return isFinite(f) ? Math.max(MIN_FRACTION, Math.min(MAX_FRACTION, f)) : DEFAULT_FRACTION;
  } catch {
    return DEFAULT_FRACTION;
  }
};

export const useResizableHeight = () => {
  const [fraction, setFraction] = useState(loadFraction);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const parent = containerRef.current.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const relativeY = ev.clientY - rect.top;
      const newFraction = Math.max(MIN_FRACTION, Math.min(MAX_FRACTION, relativeY / rect.height));
      setFraction(newFraction);
    };

    const onUp = () => {
      draggingRef.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setFraction((f) => {
        localStorage.setItem(STORAGE_KEY, String(f));
        return f;
      });
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  return { fraction, containerRef, onDragStart };
};
