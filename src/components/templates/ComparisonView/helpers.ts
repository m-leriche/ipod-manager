import type { CompareEntry, FlatRow, Status, TreeNode } from "./types";

export const fmtSize = (b: number | null): string => {
  if (b === null || b === 0) return "\u2014";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
};

export const lastSegment = (path: string): string => {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(i + 1) : path;
};

/** File name with its extension replaced by .mp3 (transcoded pair display). */
export const mp3Name = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return `${dot > 0 ? name.slice(0, dot) : name}.mp3`;
};

export const buildTree = (entries: CompareEntry[]): TreeNode[] => {
  const folderMap = new Map<string, CompareEntry[]>();
  for (const e of entries) {
    const lastSlash = e.relative_path.lastIndexOf("/");
    const folder = lastSlash >= 0 ? e.relative_path.slice(0, lastSlash) : "";
    if (!folderMap.has(folder)) folderMap.set(folder, []);
    folderMap.get(folder)!.push(e);
  }

  interface RawNode {
    children: Map<string, RawNode>;
    files: CompareEntry[];
    fullPath: string;
  }

  const root: RawNode = { children: new Map(), files: [], fullPath: "" };

  for (const [folderPath, files] of folderMap) {
    let current = root;
    if (folderPath === "") {
      current.files.push(...files);
    } else {
      const parts = folderPath.split("/");
      let built = "";
      for (const part of parts) {
        built = built ? `${built}/${part}` : part;
        if (!current.children.has(part)) {
          current.children.set(part, { children: new Map(), files: [], fullPath: built });
        }
        current = current.children.get(part)!;
      }
      current.files.push(...files);
    }
  }

  const convert = (raw: RawNode, name: string): TreeNode => {
    const children: TreeNode[] = [];
    for (const [childName, childRaw] of [...raw.children.entries()].sort((a, b) =>
      a[0].toLowerCase().localeCompare(b[0].toLowerCase()),
    )) {
      children.push(convert(childRaw, childName));
    }

    raw.files.sort((a, b) =>
      lastSegment(a.relative_path).toLowerCase().localeCompare(lastSegment(b.relative_path).toLowerCase()),
    );

    const totalCounts: Record<Status, number> = { source_only: 0, target_only: 0, modified: 0, same: 0 };
    let totalFiles = 0;
    const actionablePaths: string[] = [];

    for (const f of raw.files) {
      totalCounts[f.status]++;
      totalFiles++;
      if (f.status !== "same") actionablePaths.push(f.relative_path);
    }
    for (const c of children) {
      for (const s of Object.keys(totalCounts) as Status[]) totalCounts[s] += c.totalCounts[s];
      totalFiles += c.totalFiles;
      actionablePaths.push(...c.actionablePaths);
    }

    const hasDifferences = totalCounts.source_only > 0 || totalCounts.target_only > 0 || totalCounts.modified > 0;
    const statuses = (Object.keys(totalCounts) as Status[]).filter((s) => totalCounts[s] > 0);
    const dominant: Status | "mixed" = statuses.length === 1 ? statuses[0] : "mixed";

    return {
      name,
      path: raw.fullPath,
      files: raw.files,
      children,
      totalCounts,
      totalFiles,
      hasDifferences,
      dominant,
      actionablePaths,
    };
  };

  const treeChildren: TreeNode[] = [];
  for (const [childName, childRaw] of [...root.children.entries()].sort((a, b) =>
    a[0].toLowerCase().localeCompare(b[0].toLowerCase()),
  )) {
    treeChildren.push(convert(childRaw, childName));
  }
  if (root.files.length > 0) {
    const rootCounts: Record<Status, number> = { source_only: 0, target_only: 0, modified: 0, same: 0 };
    for (const f of root.files) rootCounts[f.status]++;
    const hasDiff = rootCounts.source_only > 0 || rootCounts.target_only > 0 || rootCounts.modified > 0;
    const sts = (Object.keys(rootCounts) as Status[]).filter((s) => rootCounts[s] > 0);
    treeChildren.unshift({
      name: "(root files)",
      path: "",
      files: root.files,
      children: [],
      totalCounts: rootCounts,
      totalFiles: root.files.length,
      hasDifferences: hasDiff,
      dominant: sts.length === 1 ? sts[0] : "mixed",
      actionablePaths: root.files.filter((f) => f.status !== "same").map((f) => f.relative_path),
    });
  }

  return treeChildren;
};

/** Collect all folder paths in a tree */
export const collectPaths = (nodes: TreeNode[]): string[] => {
  const paths: string[] = [];
  for (const n of nodes) {
    paths.push(n.path);
    paths.push(...collectPaths(n.children));
  }
  return paths;
};

/** Collect paths of nodes that have differences */
export const collectDiffPaths = (nodes: TreeNode[]): string[] => {
  const paths: string[] = [];
  for (const n of nodes) {
    if (n.hasDifferences) {
      paths.push(n.path);
      paths.push(...collectDiffPaths(n.children));
    }
  }
  return paths;
};

/**
 * Flatten the visible tree into a linear list of rows for virtualization.
 * Respects the expansion set: a collapsed folder contributes only its own row.
 *
 * `filesFirst` controls ordering within an expanded folder — the split view
 * lists files above sub-folders, the tree view lists sub-folders first.
 */
export const flattenTree = (nodes: TreeNode[], expanded: Set<string>, filesFirst = false): FlatRow[] => {
  const rows: FlatRow[] = [];

  const walk = (node: TreeNode, depth: number) => {
    rows.push({ kind: "folder", node, depth });
    if (!expanded.has(node.path)) return;

    const pushFiles = () => {
      for (const entry of node.files) rows.push({ kind: "file", entry, depth });
    };
    const pushChildren = () => {
      for (const child of node.children) walk(child, depth + 1);
    };

    if (filesFirst) {
      pushFiles();
      pushChildren();
    } else {
      pushChildren();
      pushFiles();
    }
  };

  for (const node of nodes) walk(node, 0);
  return rows;
};
