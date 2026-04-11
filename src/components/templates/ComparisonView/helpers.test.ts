import { describe, it, expect } from "vitest";
import { buildTree, collectPaths, collectDiffPaths, collectActionableFiles, fmtSize, lastSegment } from "./helpers";
import type { CompareEntry } from "./types";

const entry = (relative_path: string, status: CompareEntry["status"] = "source_only"): CompareEntry => ({
  relative_path,
  is_dir: false,
  source_size: 100,
  target_size: null,
  source_modified: null,
  target_modified: null,
  status,
});

describe("fmtSize", () => {
  it("returns dash for null", () => {
    expect(fmtSize(null)).toBe("\u2014");
  });

  it("returns dash for zero", () => {
    expect(fmtSize(0)).toBe("\u2014");
  });

  it("formats bytes", () => {
    expect(fmtSize(512)).toBe("512 B");
  });

  it("formats kilobytes", () => {
    expect(fmtSize(1536)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(fmtSize(5242880)).toBe("5.0 MB");
  });

  it("formats gigabytes", () => {
    expect(fmtSize(2147483648)).toBe("2.00 GB");
  });
});

describe("lastSegment", () => {
  it("returns full string when no slash", () => {
    expect(lastSegment("file.txt")).toBe("file.txt");
  });

  it("returns segment after last slash", () => {
    expect(lastSegment("a/b/c.txt")).toBe("c.txt");
  });

  it("handles trailing segment", () => {
    expect(lastSegment("folder/sub")).toBe("sub");
  });
});

describe("buildTree", () => {
  it("returns empty array for no entries", () => {
    expect(buildTree([])).toEqual([]);
  });

  it("creates root files node for top-level entries", () => {
    const tree = buildTree([entry("file1.txt"), entry("file2.txt")]);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("(root files)");
    expect(tree[0].files).toHaveLength(2);
  });

  it("groups files into folder nodes", () => {
    const tree = buildTree([entry("Music/song.mp3"), entry("Music/album.mp3"), entry("Photos/pic.jpg")]);
    expect(tree).toHaveLength(2);
    const names = tree.map((n) => n.name).sort();
    expect(names).toEqual(["Music", "Photos"]);
    const music = tree.find((n) => n.name === "Music")!;
    expect(music.files).toHaveLength(2);
  });

  it("handles nested folders", () => {
    const tree = buildTree([entry("a/b/c/file.txt")]);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("a");
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].name).toBe("b");
    expect(tree[0].children[0].children).toHaveLength(1);
    expect(tree[0].children[0].children[0].name).toBe("c");
    expect(tree[0].children[0].children[0].files).toHaveLength(1);
  });

  it("computes totalCounts recursively", () => {
    const tree = buildTree([
      entry("folder/a.txt", "source_only"),
      entry("folder/b.txt", "modified"),
      entry("folder/sub/c.txt", "target_only"),
    ]);
    const folder = tree[0];
    expect(folder.totalCounts.source_only).toBe(1);
    expect(folder.totalCounts.modified).toBe(1);
    expect(folder.totalCounts.target_only).toBe(1);
    expect(folder.totalFiles).toBe(3);
  });

  it("sets hasDifferences correctly", () => {
    const tree = buildTree([entry("folder/a.txt", "same")]);
    expect(tree[0].hasDifferences).toBe(false);

    const tree2 = buildTree([entry("folder/a.txt", "modified")]);
    expect(tree2[0].hasDifferences).toBe(true);
  });

  it("sorts folders alphabetically case-insensitive", () => {
    const tree = buildTree([entry("Zebra/a.txt"), entry("alpha/b.txt"), entry("Beta/c.txt")]);
    expect(tree.map((n) => n.name)).toEqual(["alpha", "Beta", "Zebra"]);
  });
});

describe("collectPaths", () => {
  it("returns empty for empty tree", () => {
    expect(collectPaths([])).toEqual([]);
  });

  it("collects all node paths", () => {
    const tree = buildTree([entry("a/b/file.txt"), entry("c/file.txt")]);
    const paths = collectPaths(tree);
    expect(paths).toContain("a");
    expect(paths).toContain("a/b");
    expect(paths).toContain("c");
  });
});

describe("collectDiffPaths", () => {
  it("only collects paths with differences", () => {
    const tree = buildTree([entry("changed/file.txt", "modified"), entry("same/file.txt", "same")]);
    const paths = collectDiffPaths(tree);
    expect(paths).toContain("changed");
    expect(paths).not.toContain("same");
  });
});

describe("collectActionableFiles", () => {
  it("excludes same-status files", () => {
    const tree = buildTree([
      entry("folder/new.txt", "source_only"),
      entry("folder/old.txt", "same"),
      entry("folder/changed.txt", "modified"),
    ]);
    const actionable = collectActionableFiles(tree[0]);
    expect(actionable).toContain("folder/new.txt");
    expect(actionable).toContain("folder/changed.txt");
    expect(actionable).not.toContain("folder/old.txt");
  });

  it("collects from nested children", () => {
    const tree = buildTree([entry("a/b/deep.txt", "target_only")]);
    const actionable = collectActionableFiles(tree[0]);
    expect(actionable).toContain("a/b/deep.txt");
  });

  it("returns empty for all-same tree", () => {
    const tree = buildTree([entry("folder/file.txt", "same")]);
    const actionable = collectActionableFiles(tree[0]);
    expect(actionable).toEqual([]);
  });
});
