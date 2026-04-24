export interface DiskInfo {
  identifier: string;
  size: string;
  name: string;
  mounted: boolean;
  mount_point: string | null;
  free_space: number | null;
  used_space: number | null;
  total_space: number | null;
  media_name: string | null;
}

export type Status = "detecting" | "not_found" | "found" | "mounted" | "mounting" | "unmounting";

export interface Message {
  text: string;
  type: "error" | "success" | "info";
}

export interface MountPanelProps {
  onMountChange?: (mounted: boolean) => void;
  onDiskInfoChange?: (diskInfo: DiskInfo | null) => void;
  compact?: boolean;
}
