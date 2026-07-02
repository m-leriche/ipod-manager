import { useState, useCallback, useEffect, useMemo } from "react";
import type { TrackTableColumn } from "./constants";
import { getSetting, setSetting } from "../../../utils/settings";

const loadOverrides = (): Record<string, boolean> => {
  const saved = getSetting("columnVisibility");
  return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
};

/** Which track-table columns are shown. Persisted as per-column overrides so
    columns added in future releases keep their default visibility instead of
    being hidden by a stale saved list. "title" can never be hidden — the
    table always needs an anchor column. */
export const useColumnVisibility = (columns: TrackTableColumn[]) => {
  const [overrides, setOverrides] = useState<Record<string, boolean>>(loadOverrides);

  useEffect(() => {
    setSetting("columnVisibility", overrides);
  }, [overrides]);

  const visibleKeys = useMemo(() => {
    const keys = new Set(columns.filter((c) => overrides[c.key] ?? !c.defaultHidden).map((c) => c.key));
    keys.add("title");
    return keys;
  }, [columns, overrides]);

  const toggleColumnVisibility = useCallback(
    (key: string) => {
      if (key === "title") return;
      setOverrides((prev) => ({ ...prev, [key]: !visibleKeys.has(key) }));
    },
    [visibleKeys],
  );

  return { visibleKeys, toggleColumnVisibility };
};
