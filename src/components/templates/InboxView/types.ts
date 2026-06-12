export type CheckStatus = "pass" | "warn" | "fail" | "pending";

export interface CheckResult {
  status: CheckStatus;
  detail: string | null;
}

export interface AlbumChecks {
  tags: CheckResult;
  cover: CheckResult;
  tracklist: CheckResult;
  duplicate: CheckResult;
}

export interface InboxTrack {
  file_path: string;
  file_name: string;
  title: string | null;
  track_number: number | null;
  duration_secs: number;
  format: string;
  bitrate_kbps: number | null;
}

export interface InboxAlbum {
  folder_path: string;
  folder_name: string;
  artist: string | null;
  album: string | null;
  year: number | null;
  tracks: InboxTrack[];
  checks: AlbumChecks;
}

export interface FileMove {
  from: string;
  to: string;
  is_audio: boolean;
}

export interface FileAwayResult {
  moves: FileMove[];
  errors: string[];
}
