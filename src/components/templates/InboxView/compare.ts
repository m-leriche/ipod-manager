import { formatDuration } from "../../../utils/format";
import type { MbMedium, MbReleaseDetail, MbTrack } from "../../../types/musicbrainz";
import type { ComparisonRow, InboxTrack, ReleaseComparison } from "./types";

/** Durations that disagree by more than this are usually a different mix. */
const DURATION_TOLERANCE_SECS = 5;

const normalizeTitle = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]/g, "");

const localTitle = (t: InboxTrack): string => normalizeTitle(t.title ?? t.file_name);

/**
 * Align local files against a release's tracklist: first by disc + track
 * number, then by title for anything left over. Local files with no
 * counterpart land at the end so extra tracks are visible rather than dropped.
 */
export const buildComparisonRows = (local: InboxTrack[], mb: MbTrack[]): ComparisonRow[] => {
  const unused = new Set(local.map((_, i) => i));

  const take = (predicate: (t: InboxTrack) => boolean): InboxTrack | null => {
    for (const i of unused) {
      if (predicate(local[i])) {
        unused.delete(i);
        return local[i];
      }
    }
    return null;
  };

  const rows: ComparisonRow[] = mb.map((track) => ({
    key: `mb-${track.disc_number}-${track.position}`,
    mb: track,
    local:
      take((t) => (t.disc_number ?? 1) === track.disc_number && t.track_number === track.position) ??
      take((t) => localTitle(t) === normalizeTitle(track.title)),
  }));

  for (const i of unused) {
    rows.push({ key: `local-${local[i].file_path}`, local: local[i], mb: null });
  }

  return rows;
};

/** A row anchored to a release track, as opposed to a file with no counterpart. */
export const isReleaseRow = (row: ComparisonRow): row is ComparisonRow & { mb: MbTrack } => row.mb !== null;

export interface ComparisonSummary {
  matched: number;
  missing: number;
  extra: number;
}

export const summarizeRows = (rows: ComparisonRow[]): ComparisonSummary => ({
  matched: rows.filter((r) => r.local && r.mb).length,
  missing: rows.filter((r) => !r.local).length,
  extra: rows.filter((r) => !r.mb).length,
});

/** "2 discs · 11 + 10 tracks", or "12 tracks" for a single disc. */
export const describeMedia = (media: MbMedium[], trackCount: number): string => {
  if (media.length <= 1) return `${trackCount} tracks`;
  return `${media.length} discs · ${media.map((m) => m.track_count).join(" + ")} tracks`;
};

export const releaseYear = (date: string | null): string | null => date?.slice(0, 4) || null;

/** "Ty Segall · 2010 · Vinyl · 12 tracks" */
export const releaseMeta = (detail: MbReleaseDetail): string => {
  const { release, media } = detail;
  const format = media.length === 1 ? media[0].format : null;
  return [release.artist, releaseYear(release.date), format, describeMedia(media, release.track_count)]
    .filter(Boolean)
    .join(" · ");
};

/**
 * The one thing worth saying about a row, or null when the file matches the
 * release cleanly. Titles win over durations — a renamed track matters more
 * than a few seconds of drift.
 */
export const trackNote = (row: ComparisonRow): string | null => {
  const { local, mb } = row;
  if (!local || !mb) return null;

  const localName = local.title ?? local.file_name;
  if (normalizeTitle(localName) !== normalizeTitle(mb.title)) return `tagged “${localName}”`;

  if (mb.length_ms == null) return null;
  const drift = Math.abs(local.duration_secs - mb.length_ms / 1000);
  return drift > DURATION_TOLERANCE_SECS ? `your file ${formatDuration(local.duration_secs)}` : null;
};

/**
 * A plain-language reason the counts differ. The multi-disc case is called out
 * explicitly because a split-folder rip is the most common false mismatch.
 */
export const diagnose = (rows: ComparisonRow[], comparison: ReleaseComparison, localCount: number): string => {
  const { matched, missing, extra } = summarizeRows(rows);
  const { media } = comparison.detail;

  if (missing === 0 && extra === 0) return "Every track matches this release.";

  if (extra === 0 && media.length > 1) {
    const discs = new Set(rows.filter((r) => r.local).map((r) => r.mb?.disc_number));
    const only = discs.size === 1 ? [...discs][0] : null;
    if (only && matched === localCount) {
      return `Your ${localCount} tracks match disc ${only} of this ${media.length}-disc release. The other disc may be in a separate folder.`;
    }
  }

  if (extra === 0) return `Missing ${missing} of ${comparison.detail.tracks.length} tracks.`;

  if (missing === 0) {
    return `You have ${extra} extra ${extra === 1 ? "track" : "tracks"} — this may be a deluxe or expanded edition.`;
  }

  return `${missing} missing, ${extra} extra — this looks like a different edition.`;
};
