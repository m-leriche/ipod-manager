import { useState, useCallback, useEffect } from "react";
import type { TrackTableColumn } from "./constants";
import { getSetting, setSetting } from "../../../utils/settings";

const loadVisibility = (columns: TrackTableColumn[]): Set<string> => {
  const saved = getSetting("columnVisibility");
  const known = new Set(columns.map((c) => c.key));
  if (Array.isArray(saved) && saved.length > 0) {
    const keys = saved.filter((k) => known.has(k));
    if (keys.length > 0) return new Set(keys);
  }
  return new Set(columns.filter((c) => !c.defaultHidden).map((c) => c.key));
};

/** Which track-table columns are shown. Persisted; "title" can't be hidden
    so the table always has an anchor column. */
export const useColumnVisibility = (columns: TrackTableColumn[]) => {
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(() => loadVisibility(columns));

  useEffect(() => {
    setSetting("columnVisibility", [...visibleKeys]);
  }, [visibleKeys]);

  const toggleColumnVisibility = useCallback((key: string) => {
    if (key === "title") return;
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return { visibleKeys, toggleColumnVisibility };
};
