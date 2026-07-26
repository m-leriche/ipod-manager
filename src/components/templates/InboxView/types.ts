import type { MbRelease, MbReleaseDetail, MbTrack } from "../../../types/musicbrainz";

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
  disc_number: number | null;
  duration_secs: number;
  format: string;
  bitrate_kbps: number | null;
  sample_rate: number | null;
  bit_depth: number | null;
}

export interface ConvertTarget {
  label: string;
  target_format: "flac" | "mp3";
  sample_rate: number | null;
  bit_depth: number | null;
  mp3_bitrate: number | null;
}

export interface ConvertProgress {
  completed_files: number;
  total_files: number;
  current_file: string;
  /** Overall batch percent — files convert in parallel, so events interleave. */
  percent: number;
  phase: string;
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

/** The MusicBrainz release an album was checked against, fetched on demand. */
export interface ReleaseComparison {
  query_artist: string;
  query_album: string;
  detail: MbReleaseDetail;
  alternatives: MbRelease[];
}

/** One aligned line of the comparison. At least one side is always present. */
export interface ComparisonRow {
  key: string;
  local: InboxTrack | null;
  mb: MbTrack | null;
}
