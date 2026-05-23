import type { LibraryTrack } from "../../../types/library";
import { sortKey } from "../../atoms/AlphabetScroller/helpers";
import type { HealthIssue } from "./types";

export const issuePercentage = (count: number, total: number): string => {
  if (total === 0) return "0%";
  return `${((count / total) * 100).toFixed(1)}%`;
};

export const issueSeverity = (issue: HealthIssue, total: number): "ok" | "warning" | "critical" => {
  if (issue.count === 0) return "ok";
  if (issue.id === "never_played" || issue.id === "unrated") {
    return issue.count / total > 0.8 ? "warning" : "ok";
  }
  return issue.count / total > 0.1 ? "critical" : "warning";
};

const AUDIO_EXT = /\.(mp3|flac|m4a|aac|ogg|opus|wav|wma|alac|aiff|aif|ape|wv)$/i;
const DISC_TRACK = /^\d{1,2}-\d{1,2}[\s_]+/;
const TRACK_DOT = /^\d{1,3}\.\s+/;
const TRACK_PAREN = /^\d{1,3}\)\s+/;
const TRACK_DASH = /^\d{1,3}[\s_]+-[\s_]+/;
const TRACK_UNDERSCORE = /^\d{1,3}_/;
const TRACK_SPACE = /^\d{1,3}\s+/;

export const extractTitleFromFileName = (fileName: string): string | null => {
  let name = fileName.replace(AUDIO_EXT, "").trim();
  if (!name) return null;

  // Strip disc-track prefix (e.g. "01-02 "), up to 2x for doubled prefixes
  for (let i = 0; i < 2; i++) {
    if (DISC_TRACK.test(name)) name = name.replace(DISC_TRACK, "");
    else break;
  }

  // Strip track number prefix: "03. ", "03) ", "03 - ", "03_-_", "03_"
  if (TRACK_DOT.test(name)) {
    name = name.replace(TRACK_DOT, "");
  } else if (TRACK_PAREN.test(name)) {
    name = name.replace(TRACK_PAREN, "");
  } else if (TRACK_DASH.test(name)) {
    name = name.replace(TRACK_DASH, "");
  } else if (TRACK_UNDERSCORE.test(name)) {
    name = name.replace(TRACK_UNDERSCORE, "");
  } else {
    // Plain "03 Title" — but don't strip if remainder starts with ordinal suffix (e.g. "4th")
    const m = name.match(TRACK_SPACE);
    if (m && !/^(st|nd|rd|th)\b/i.test(name.slice(m[0].length))) {
      name = name.slice(m[0].length);
    }
  }

  // Normalize underscores to spaces (common in ripped/downloaded filenames)
  name = name.replace(/_/g, " ").trim();
  if (!name) return null;

  // Reject if the result is just a bare disc-track or track number (not a real title)
  if (/^\d{1,2}-\d{1,2}$/.test(name) || /^\d{1,3}$/.test(name)) return null;

  return name;
};

const DATE_ALBUM = /^(\d{4})[-./]\d{1,2}[-./]\d{1,2}/;

export const extractYearFromAlbumTitle = (album: string): number | null => {
  const m = album.match(DATE_ALBUM);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  if (year < 1900 || year > 2099) return null;
  return year;
};

/** Get the first letter for a track field value, matching the AlphabetScroller convention. */
export const getTrackLetter = (track: LibraryTrack, field: keyof LibraryTrack): string => {
  const val = (track[field] as string) ?? "";
  const key = sortKey(val);
  if (!key) return "#";
  const first = key[0];
  return /[a-z]/.test(first) ? first.toUpperCase() : "#";
};

/** Build a letter → first-row-index map from a sorted track list. */
export const buildTrackLetterMap = (
  sortedTracks: LibraryTrack[],
  sortField: keyof LibraryTrack,
): Map<string, number> => {
  const map = new Map<string, number>();
  for (let i = 0; i < sortedTracks.length; i++) {
    const letter = getTrackLetter(sortedTracks[i], sortField);
    if (!map.has(letter)) {
      map.set(letter, i);
    }
  }
  return map;
};

const DISC_TRACK_EXACT = /^(\d{1,2})-(\d{1,2})[\s_]/;

export const extractTrackInfoFromFileName = (fileName: string): { discNumber: number; trackNumber: number } | null => {
  const name = fileName.replace(AUDIO_EXT, "").trim();
  const m = name.match(DISC_TRACK_EXACT);
  if (!m) return null;
  const disc = parseInt(m[1], 10);
  const track = parseInt(m[2], 10);
  if (track === 0) return null;
  return { discNumber: disc || 1, trackNumber: track };
};
