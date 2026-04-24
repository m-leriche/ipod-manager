export type { TrackMetadata, MetadataUpdate, MetadataScanProgress, MetadataSaveResult } from "../../../types/metadata";

export type Phase = "idle" | "scanning" | "scanned" | "looking_up" | "saving";

export type View = "edit" | "repair" | "quality";

export interface EditableFields {
  title: string;
  artist: string;
  album: string;
  album_artist: string;
  sort_artist: string;
  sort_album_artist: string;
  track: string;
  track_total: string;
  year: string;
  genre: string;
}

export interface ArtistGroup {
  artist: string;
  albums: AlbumGroup[];
  trackCount: number;
}

export interface AlbumGroup {
  album: string;
  artist: string;
  tracks: import("../../../types/metadata").TrackMetadata[];
}

// ── Repair types ────────────────────────────────────────────────

export type IssueSeverity = "Error" | "Warning" | "Info";

export type IssueKind =
  | "TitleMismatch"
  | "TrackNumberMissing"
  | "TrackNumberWrong"
  | "ArtistInconsistent"
  | "AlbumNameMismatch"
  | "YearMissing"
  | "YearMismatch"
  | "AlbumArtistMissing"
  | "SortArtistMissing"
  | "SortAlbumArtistMissing"
  | "TrackTotalWrong"
  | "MissingTrack";

export interface TrackIssue {
  file_path: string;
  kind: IssueKind;
  severity: IssueSeverity;
  field: string;
  local_value: string | null;
  suggested_value: string | null;
  description: string;
}

export interface MbTrack {
  position: number;
  title: string;
  artist: string;
  length_ms: number | null;
}

export interface MbRelease {
  id: string;
  title: string;
  artist: string;
  date: string | null;
  track_count: number;
  score: number;
}

export interface MbReleaseDetail {
  release: MbRelease;
  tracks: MbTrack[];
}

export interface TrackMatch {
  local_track: import("../../../types/metadata").TrackMetadata;
  mb_track: MbTrack | null;
  match_confidence: number;
  issues: TrackIssue[];
}

export interface IssueSummary {
  error_count: number;
  warning_count: number;
  info_count: number;
}

export interface AlbumRepairReport {
  artist: string;
  album: string;
  folder_path: string;
  selected_release: MbReleaseDetail | null;
  alternative_releases: MbRelease[];
  match_confidence: number;
  track_matches: TrackMatch[];
  missing_tracks: MbTrack[];
  issue_summary: IssueSummary;
}

export interface RepairReport {
  albums: AlbumRepairReport[];
  total_issues: IssueSummary;
}

export interface RepairLookupProgress {
  total_albums: number;
  completed_albums: number;
  current_album: string;
  phase: string;
}

// ── Sanitize types ─────────────────────────────────────────────

export type PictureAction = "clear" | "retain_front" | "move_front";

export interface SanitizeModalOptions {
  retainFields: string[];
  pictureAction: PictureAction;
  coverFilename: string;
  preserveReplayGain: boolean;
  reduceDateToYear: boolean;
  dropDiscForSingle: boolean;
}
