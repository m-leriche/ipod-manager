import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { buildTree, collectDiffPaths } from "./helpers";
import { cancelSync } from "../../../utils/cancelSync";
import type { CompareEntry, Filter } from "./types";

export const useComparison = (
  sourcePath: string,
  targetPath: string,
  exclusions: string[],
  onCompared: (expanded: Set<string>) => void,
) => {
  const [entries, setEntries] = useState<CompareEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("differences");

  const cancel = useCallback(() => cancelSync(), []);

  const compare = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invoke<CompareEntry[]>("compare_directories", { source: sourcePath, target: targetPath });
      setEntries(data);
      const tree = buildTree(data.filter((e) => e.status !== "same"));
      onCompared(new Set(collectDiffPaths(tree)));
    } catch (e) {
      const msg = `${e}`;
      if (!msg.includes("Cancelled")) {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [sourcePath, targetPath, onCompared]);

  useEffect(() => {
    compare();
  }, [compare]);

  const visibleEntries = useMemo(() => {
    if (exclusions.length === 0) return entries;
    return entries.filter(
      (e) => !exclusions.some((ex) => e.relative_path === ex || e.relative_path.startsWith(ex + "/")),
    );
  }, [entries, exclusions]);

  const filtered = useMemo(() => {
    if (filter === "all") return visibleEntries;
    if (filter === "differences") return visibleEntries.filter((e) => e.status !== "same");
    return visibleEntries.filter((e) => e.status === filter);
  }, [visibleEntries, filter]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);

  const entryMap = useMemo(() => new Map(visibleEntries.map((e) => [e.relative_path, e])), [visibleEntries]);

  const stats = useMemo(() => {
    const s = { source_only: 0, target_only: 0, modified: 0, same: 0 };
    visibleEntries.forEach((e) => s[e.status]++);
    return s;
  }, [visibleEntries]);

  return {
    loading,
    error,
    setError,
    filter,
    setFilter,
    compare,
    cancel,
    visibleEntries,
    filtered,
    tree,
    entryMap,
    stats,
  };
};
