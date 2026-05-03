import { useState, useCallback, useRef } from "react";

const STORAGE_KEY = "crate-browser-column-widths";
const DEFAULT_WIDTHS: [number, number, number] = [1 / 3, 1 / 3, 1 / 3];
const MIN_FRACTION = 0.15;

const loadWidths = (): [number, number, number] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_WIDTHS] as [number, number, number];
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.length === 3 &&
      parsed.every((n: unknown) => typeof n === "number" && isFinite(n as number))
    ) {
      const clamped = parsed.map((f: number) => Math.max(MIN_FRACTION, f));
      const total = clamped.reduce((a: number, b: number) => a + b, 0);
      return clamped.map((f: number) => f / total) as [number, number, number];
    }
    return [...DEFAULT_WIDTHS] as [number, number, number];
  } catch {
    return [...DEFAULT_WIDTHS] as [number, number, number];
  }
};

export const useColumnBrowserWidths = () => {
  const [widths, setWidths] = useState<[number, number, number]>(loadWidths);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const onDragStart = useCallback((handleIndex: number, e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = (ev.clientX - rect.left) / rect.width;

      setWidths((prev) => {
        const next: [number, number, number] = [...prev];
        if (handleIndex === 0) {
          const maxGenre = 1 - prev[2] - MIN_FRACTION;
          const newGenre = Math.max(MIN_FRACTION, Math.min(relativeX, maxGenre));
          next[0] = newGenre;
          next[1] = 1 - newGenre - prev[2];
        } else {
          const minArtistEnd = prev[0] + MIN_FRACTION;
          const maxArtistEnd = 1 - MIN_FRACTION;
          const artistEnd = Math.max(minArtistEnd, Math.min(relativeX, maxArtistEnd));
          next[1] = artistEnd - prev[0];
          next[2] = 1 - artistEnd;
        }
        return next;
      });
    };

    const onUp = () => {
      draggingRef.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setWidths((w) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(w));
        return w;
      });
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  return { widths, containerRef, onDragStart };
};
