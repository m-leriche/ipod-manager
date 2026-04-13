import type { CompareEntry, TreeNode } from "../ComparisonView/types";

export interface SplitFileRowProps {
  entry: CompareEntry;
  depth: number;
  selected: Set<string>;
  onToggleFile: (path: string) => void;
}

export interface SplitTreeNodeRowProps {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  selected: Set<string>;
  onToggleExpand: (path: string) => void;
  onToggleNodeSelection: (node: TreeNode) => void;
  onToggleFile: (path: string) => void;
  onContextMenu: (x: number, y: number, folderPath: string) => void;
}

export interface ColumnHeaderProps {
  sourcePath: string;
  targetPath: string;
}
