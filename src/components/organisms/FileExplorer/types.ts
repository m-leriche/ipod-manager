export interface FileEntry {
  name: string;
  is_dir: boolean;
  size: number;
  modified: number;
}

export interface FileExplorerProps {
  rootPath: string;
  rootLabel: string;
  allowParentNavigation?: boolean;
  onSelectFolder?: (path: string) => void;
  selectedFolder?: string | null;
  allowDelete?: boolean;
}

export interface ClipboardState {
  paths: string[];
  operation: "copy" | "cut";
  sourceDir: string;
}

export interface ContextMenuState {
  x: number;
  y: number;
  target: "entry" | "empty";
  entry?: FileEntry;
}
