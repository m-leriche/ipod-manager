import { useState, useEffect, useCallback } from "react";
import type { FileEntry } from "./types";

export const useFileSelection = (entries: FileEntry[]) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClicked, setLastClicked] = useState<string | null>(null);

  // Reset selection when entries change (navigated to new directory)
  useEffect(() => {
    setSelected(new Set());
    setLastClicked(null);
  }, [entries]);

  const handleClick = useCallback(
    (name: string, e: { metaKey: boolean; shiftKey: boolean }) => {
      setSelected((prev) => {
        if (e.shiftKey && lastClicked) {
          const names = entries.map((entry) => entry.name);
          const start = names.indexOf(lastClicked);
          const end = names.indexOf(name);
          if (start >= 0 && end >= 0) {
            const range = names.slice(Math.min(start, end), Math.max(start, end) + 1);
            const next = e.metaKey ? new Set(prev) : new Set<string>();
            range.forEach((n) => next.add(n));
            return next;
          }
        }

        if (e.metaKey) {
          const next = new Set(prev);
          next.has(name) ? next.delete(name) : next.add(name);
          return next;
        }

        return new Set([name]);
      });
      setLastClicked(name);
    },
    [entries, lastClicked],
  );

  const selectAll = useCallback(() => {
    setSelected(new Set(entries.map((e) => e.name)));
  }, [entries]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  const isSelected = useCallback((name: string) => selected.has(name), [selected]);

  return { selected, handleClick, selectAll, clearSelection, isSelected };
};
