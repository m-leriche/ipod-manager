export interface SyncManagerProps {
  sourcePath: string | null;
  targetPath: string | null;
  exclusions: string[];
  onSourcePathChange: (path: string) => void;
  onTargetPathChange: (path: string) => void;
  onExclusionsChange: (exclusions: string[]) => void;
}
