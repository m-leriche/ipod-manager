export interface CompareEntry {
  relative_path: string;
  is_dir: boolean;
  source_size: number | null;
  target_size: number | null;
  source_modified: number | null;
  target_modified: number | null;
  status: "source_only" | "target_only" | "modified" | "same";
}

export interface CopyOp {
  source_path: string;
  dest_path: string;
}

export interface CopyResult {
  total: number;
  succeeded: number;
  failed: number;
  cancelled: boolean;
  errors: string[];
}

export interface SyncProgress {
  total: number;
  completed: number;
  current_file: string;
  phase: string;
}

export type Filter = "all" | "differences" | "source_only" | "target_only" | "modified" | "same";
export type Status = CompareEntry["status"];

/** A node in the folder tree. Can contain files and child folders. */
export interface TreeNode {
  name: string;
  path: string;
  files: CompareEntry[];
  children: TreeNode[];
  totalCounts: Record<Status, number>;
  totalFiles: number;
  hasDifferences: boolean;
  dominant: Status | "mixed";
}

export interface ComparisonViewProps {
  sourcePath: string;
  targetPath: string;
  exclusions: string[];
  onAddExclusion: (path: string) => void;
  onBack: () => void;
}

export interface TreeNodeRowProps {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  selected: Set<string>;
  onToggleExpand: (path: string) => void;
  onToggleNodeSelection: (node: TreeNode) => void;
  onToggleFile: (path: string) => void;
  onContextMenu: (x: number, y: number, folderPath: string) => void;
}

export interface SyncActionsProps {
  syncing: boolean;
  progress: SyncProgress | null;
  result: CopyResult | null;
  nSrc: number;
  nTgt: number;
  nMirror: number;
  onMirrorToTarget: () => void;
  onCopyToTarget: () => void;
  onCopyToSource: () => void;
  onDeleteTarget: () => void;
  onCancel: () => void;
}
