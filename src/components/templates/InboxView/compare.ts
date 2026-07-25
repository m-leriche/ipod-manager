import type { MbMedium, MbTrack } from "../../../types/musicbrainz";
import type { ComparisonRow, InboxTrack, ReleaseComparison } from "./types";

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
