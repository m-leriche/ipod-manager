import type { CompareEntry, TreeNode } from "../ComparisonView/types";

export interface SplitFileRowProps {
  entry: CompareEntry;
  depth: number;
  isSelected: boolean;
  onToggleFile: (path: string) => void;
}

export interface SplitFolderRowProps {
  node: TreeNode;
  depth: number;
  isExpanded: boolean;
  allChecked: boolean;
  someChecked: boolean;
  onToggleExpand: (path: string) => void;
  onToggleNodeSelection: (node: TreeNode) => void;
  onContextMenu: (x: number, y: number, folderPath: string) => void;
}

export interface ColumnHeaderProps {
  sourcePath: string;
  targetPath: string;
}
