import { useCallback, useState } from "react";
import { collectPaths } from "./helpers";
import type { CompareEntry, TreeNode } from "./types";

export const useTreeSelection = (filtered: CompareEntry[]) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback(
    (p: string) =>
      setSelected((prev) => {
        const n = new Set(prev);
        if (n.has(p)) n.delete(p);
        else n.add(p);
        return n;
      }),
    [],
  );

  const toggleNodeSelection = useCallback((node: TreeNode) => {
    const actionable = node.actionablePaths;
    setSelected((prev) => {
      const allSelected = actionable.length > 0 && actionable.every((p) => prev.has(p));
      const n = new Set(prev);
      actionable.forEach((p) => (allSelected ? n.delete(p) : n.add(p)));
      return n;
    });
  }, []);

  const selAll = useCallback(
    () => setSelected(new Set(filtered.filter((e) => e.status !== "same").map((e) => e.relative_path))),
    [filtered],
  );
  const selNone = useCallback(() => setSelected(new Set()), []);
  const reset = useCallback(() => setSelected(new Set()), []);

  return { selected, toggle, toggleNodeSelection, selAll, selNone, reset };
};

export const useTreeExpansion = (tree: TreeNode[]) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((path: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(path)) n.delete(path);
      else n.add(path);
      return n;
    });
  }, []);

  const expandAll = useCallback(() => setExpanded(new Set(collectPaths(tree))), [tree]);
  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  return { expanded, setExpanded, toggleExpand, expandAll, collapseAll };
};
