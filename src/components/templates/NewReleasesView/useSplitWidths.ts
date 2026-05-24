import { useState, useCallback, useRef } from "react";
import { getSetting, setSetting } from "../../../utils/settings";

const DEFAULT_WIDTHS: [number, number] = [0.25, 0.75];
const MIN_FRACTION = 0.15;

const loadWidths = (): [number, number] => {
  const parsed = getSetting("releasesColumnWidths");
  if (parsed.length === 2) {
    const left = Math.max(MIN_FRACTION, Math.min(1 - MIN_FRACTION, parsed[0]));
    return [left, 1 - left];
  }
  return [...DEFAULT_WIDTHS];
};

export const useSplitWidths = () => {
  const [widths, setWidths] = useState<[number, number]>(loadWidths);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = (ev.clientX - rect.left) / rect.width;
      const clamped = Math.max(MIN_FRACTION, Math.min(1 - MIN_FRACTION, relativeX));
      setWidths([clamped, 1 - clamped]);
    };

    const onUp = () => {
      draggingRef.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setWidths((w) => {
        setSetting("releasesColumnWidths", [...w]);
        return w;
      });
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  return { widths, containerRef, onDragStart };
};
