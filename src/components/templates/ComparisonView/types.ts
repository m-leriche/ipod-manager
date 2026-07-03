import type { TranscodeBitrate } from "../../../types/profiles";

export interface CompareEntry {
  relative_path: string;
  is_dir: boolean;
  source_size: number | null;
  target_size: number | null;
  source_modified: number | null;
  target_modified: number | null;
  status: "source_only" | "target_only" | "modified" | "same";
  /** Lossless source paired with (or destined for) a transcoded .mp3 on the target. */
  transcoded?: boolean;
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
  /** All actionable (status !== "same") file paths under this node, including
   *  descendants. Precomputed once so rows don't re-walk the subtree on every
   *  render. */
  actionablePaths: string[];
}

/** A single rendered row in the flattened, virtualized tree — either a folder
 *  header or one of its files. `depth` is the owning folder's depth. */
export type FlatRow =
  | { kind: "folder"; node: TreeNode; depth: number }
  | { kind: "file"; entry: CompareEntry; depth: number };

export interface ComparisonViewProps {
  sourcePath: string;
  targetPath: string;
  exclusions: string[];
  /** MP3 target when lossless-to-MP3 transcoding is enabled, null when off. */
  transcode: TranscodeBitrate | null;
  onAddExclusion: (path: string) => void;
  onBack: () => void;
}

export interface FolderRowProps {
  node: TreeNode;
  depth: number;
  isExpanded: boolean;
  allChecked: boolean;
  someChecked: boolean;
  onToggleExpand: (path: string) => void;
  onToggleNodeSelection: (node: TreeNode) => void;
  onContextMenu: (x: number, y: number, folderPath: string) => void;
}

export interface FileRowProps {
  entry: CompareEntry;
  depth: number;
  isSelected: boolean;
  onToggleFile: (path: string) => void;
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
