import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTreeSelection, useTreeExpansion } from "./useTreeSelection";
import type { CompareEntry, TreeNode } from "./types";

const makeEntry = (path: string, status: CompareEntry["status"] = "source_only"): CompareEntry => ({
  relative_path: path,
  is_dir: false,
  source_size: 100,
  target_size: null,
  source_modified: null,
  target_modified: null,
  status,
});

const makeNode = (path: string, files: CompareEntry[], children: TreeNode[] = []): TreeNode => ({
  name: path.split("/").pop() ?? path,
  path,
  files,
  children,
  totalCounts: { source_only: 0, target_only: 0, modified: 0, same: 0 },
  totalFiles: files.length,
  hasDifferences: files.some((f) => f.status !== "same"),
  dominant: "mixed",
});

describe("useTreeSelection", () => {
  const entries: CompareEntry[] = [
    makeEntry("a.txt", "source_only"),
    makeEntry("b.txt", "target_only"),
    makeEntry("c.txt", "same"),
    makeEntry("d.txt", "modified"),
  ];

  it("starts with empty selection", () => {
    const { result } = renderHook(() => useTreeSelection(entries));
    expect(result.current.selected.size).toBe(0);
  });

  it("toggle adds and removes a path", () => {
    const { result } = renderHook(() => useTreeSelection(entries));
    act(() => result.current.toggle("a.txt"));
    expect(result.current.selected.has("a.txt")).toBe(true);
    act(() => result.current.toggle("a.txt"));
    expect(result.current.selected.has("a.txt")).toBe(false);
  });

  it("selAll selects all non-same entries", () => {
    const { result } = renderHook(() => useTreeSelection(entries));
    act(() => result.current.selAll());
    expect(result.current.selected.size).toBe(3);
    expect(result.current.selected.has("a.txt")).toBe(true);
    expect(result.current.selected.has("b.txt")).toBe(true);
    expect(result.current.selected.has("d.txt")).toBe(true);
    expect(result.current.selected.has("c.txt")).toBe(false);
  });

  it("selNone clears selection", () => {
    const { result } = renderHook(() => useTreeSelection(entries));
    act(() => result.current.selAll());
    act(() => result.current.selNone());
    expect(result.current.selected.size).toBe(0);
  });

  it("reset clears selection", () => {
    const { result } = renderHook(() => useTreeSelection(entries));
    act(() => result.current.toggle("a.txt"));
    act(() => result.current.reset());
    expect(result.current.selected.size).toBe(0);
  });

  it("toggleNodeSelection selects all actionable files in node", () => {
    const nodeFiles = [makeEntry("folder/x.txt", "source_only"), makeEntry("folder/y.txt", "modified")];
    const node = makeNode("folder", nodeFiles);

    const { result } = renderHook(() => useTreeSelection(entries));
    act(() => result.current.toggleNodeSelection(node));
    expect(result.current.selected.has("folder/x.txt")).toBe(true);
    expect(result.current.selected.has("folder/y.txt")).toBe(true);
  });

  it("toggleNodeSelection deselects all when all already selected", () => {
    const nodeFiles = [makeEntry("folder/x.txt", "source_only")];
    const node = makeNode("folder", nodeFiles);

    const { result } = renderHook(() => useTreeSelection(entries));
    act(() => result.current.toggle("folder/x.txt"));
    expect(result.current.selected.has("folder/x.txt")).toBe(true);
    act(() => result.current.toggleNodeSelection(node));
    expect(result.current.selected.has("folder/x.txt")).toBe(false);
  });

  it("toggleNodeSelection ignores same-status files", () => {
    const nodeFiles = [makeEntry("folder/same.txt", "same"), makeEntry("folder/new.txt", "source_only")];
    const node = makeNode("folder", nodeFiles);

    const { result } = renderHook(() => useTreeSelection(entries));
    act(() => result.current.toggleNodeSelection(node));
    expect(result.current.selected.has("folder/new.txt")).toBe(true);
    expect(result.current.selected.has("folder/same.txt")).toBe(false);
  });
});

describe("useTreeExpansion", () => {
  const tree: TreeNode[] = [makeNode("a", [], [makeNode("a/b", []), makeNode("a/c", [])]), makeNode("d", [])];

  it("starts with empty expansion", () => {
    const { result } = renderHook(() => useTreeExpansion(tree));
    expect(result.current.expanded.size).toBe(0);
  });

  it("toggleExpand adds and removes a path", () => {
    const { result } = renderHook(() => useTreeExpansion(tree));
    act(() => result.current.toggleExpand("a"));
    expect(result.current.expanded.has("a")).toBe(true);
    act(() => result.current.toggleExpand("a"));
    expect(result.current.expanded.has("a")).toBe(false);
  });

  it("expandAll expands all tree paths", () => {
    const { result } = renderHook(() => useTreeExpansion(tree));
    act(() => result.current.expandAll());
    expect(result.current.expanded.has("a")).toBe(true);
    expect(result.current.expanded.has("a/b")).toBe(true);
    expect(result.current.expanded.has("a/c")).toBe(true);
    expect(result.current.expanded.has("d")).toBe(true);
  });

  it("collapseAll clears expansion", () => {
    const { result } = renderHook(() => useTreeExpansion(tree));
    act(() => result.current.expandAll());
    act(() => result.current.collapseAll());
    expect(result.current.expanded.size).toBe(0);
  });

  it("setExpanded replaces entire state", () => {
    const { result } = renderHook(() => useTreeExpansion(tree));
    act(() => result.current.setExpanded(new Set(["a", "d"])));
    expect(result.current.expanded.size).toBe(2);
    expect(result.current.expanded.has("a")).toBe(true);
    expect(result.current.expanded.has("d")).toBe(true);
  });
});
