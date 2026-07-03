import type { TranscodeBitrate } from "../../../types/profiles";

export interface SyncManagerProps {
  sourcePath: string | null;
  targetPath: string | null;
  exclusions: string[];
  transcodeLossless: boolean;
  transcodeBitrate: TranscodeBitrate;
  onSourcePathChange: (path: string) => void;
  onTargetPathChange: (path: string) => void;
  onExclusionsChange: (exclusions: string[]) => void;
  onTranscodeLosslessChange: (enabled: boolean) => void;
  onTranscodeBitrateChange: (bitrate: TranscodeBitrate) => void;
}
