import type { IpodInfo } from "../../../types/ipod";

export type SyncPhase = "select" | "syncing" | "done";

export interface PlaylistSyncModalProps {
  info: IpodInfo;
  onClose: () => void;
}

export interface PlaylistSyncPlanItem {
  id: number;
  is_smart: boolean;
  name: string;
  track_count: number;
}

export interface PlaylistSyncPlan {
  playlists: PlaylistSyncPlanItem[];
  total_tracks: number;
  files_to_copy: number;
  bytes_to_copy: number;
  bytes_already_present: number;
  free_space: number;
  errors: string[];
}

export interface PlaylistSyncResult {
  copied: number;
  already_present: number;
  playlists_written: number;
  cancelled: boolean;
  errors: string[];
}

export interface SyncProgressPayload {
  total: number;
  completed: number;
  current_file: string;
  phase: string;
}
