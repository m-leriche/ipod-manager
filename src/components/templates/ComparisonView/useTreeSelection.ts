import { useState } from "react";
import { collectPaths, collectActionableFiles } from "./helpers";
import type { CompareEntry, TreeNode } from "./types";

export const useTreeSelection = (filtered: CompareEntry[]) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (p: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(p) ? n.delete(p) : n.add(p);
      return n;
    });

  const toggleNodeSelection = (node: TreeNode) => {
    const actionable = collectActionableFiles(node);
    const allSelected = actionable.length > 0 && actionable.every((p) => selected.has(p));
    setSelected((prev) => {
      const n = new Set(prev);
      actionable.forEach((p) => (allSelected ? n.delete(p) : n.add(p)));
      return n;
    });
  };

  const selAll = () => setSelected(new Set(filtered.filter((e) => e.status !== "same").map((e) => e.relative_path)));
  const selNone = () => setSelected(new Set());
  const reset = () => setSelected(new Set());

  return { selected, toggle, toggleNodeSelection, selAll, selNone, reset };
};

export const useTreeExpansion = (tree: TreeNode[]) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(path) ? n.delete(path) : n.add(path);
      return n;
    });
  };

  const expandAll = () => setExpanded(new Set(collectPaths(tree)));
  const collapseAll = () => setExpanded(new Set());

  return { expanded, setExpanded, toggleExpand, expandAll, collapseAll };
};
