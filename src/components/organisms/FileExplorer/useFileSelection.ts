import { useState, useEffect, useCallback } from "react";

export const useFileSelection = (orderedIds: string[], resetKey: unknown) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClicked, setLastClicked] = useState<string | null>(null);

  // Reset selection when navigating to a new directory
  useEffect(() => {
    setSelected(new Set());
    setLastClicked(null);
  }, [resetKey]);

  const handleClick = useCallback(
    (id: string, e: { metaKey: boolean; shiftKey: boolean }) => {
      setSelected((prev) => {
        if (e.shiftKey && lastClicked) {
          const start = orderedIds.indexOf(lastClicked);
          const end = orderedIds.indexOf(id);
          if (start >= 0 && end >= 0) {
            const range = orderedIds.slice(Math.min(start, end), Math.max(start, end) + 1);
            const next = e.metaKey ? new Set(prev) : new Set<string>();
            range.forEach((n) => next.add(n));
            return next;
          }
        }

        if (e.metaKey) {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }

        return new Set([id]);
      });
      setLastClicked(id);
    },
    [orderedIds, lastClicked],
  );

  const selectAll = useCallback(() => {
    setSelected(new Set(orderedIds));
  }, [orderedIds]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  return { selected, handleClick, selectAll, clearSelection, isSelected };
};
