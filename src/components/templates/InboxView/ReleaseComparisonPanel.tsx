import { Fragment, useMemo } from "react";
import { Spinner } from "../../atoms/Spinner/Spinner";
import { ComparisonTrackRow } from "./ComparisonTrackRow";
import { buildComparisonRows, describeMedia, diagnose, releaseYear } from "./compare";
import { useReleaseComparison } from "./useReleaseComparison";
import type { InboxAlbum } from "./types";

/**
 * Shows the MusicBrainz release an album was checked against, with its
 * tracklist aligned line-by-line against the files in the inbox folder.
 */
export const ReleaseComparisonPanel = ({ album }: { album: InboxAlbum }) => {
  const { comparison, loading, error, reload } = useReleaseComparison(album, true);

  const rows = useMemo(
    () => (comparison ? buildComparisonRows(album.tracks, comparison.detail.tracks) : []),
    [album.tracks, comparison],
  );

  if (loading) {
    return (
      <Shell className="flex items-center gap-2 text-[11px] text-text-tertiary">
        <Spinner />
        Looking up release…
      </Shell>
    );
  }

  if (error || !comparison) {
    return (
      <Shell className="flex items-center gap-3">
        <p className="text-[11px] text-text-tertiary flex-1 min-w-0">{error ?? "No release to compare against."}</p>
        <button
          onClick={() => void reload()}
          className="px-2 py-1 rounded-md text-[10px] text-text-secondary border border-border hover:text-text-primary hover:border-border-active transition-colors shrink-0"
        >
          Retry
        </button>
      </Shell>
    );
  }

  const { release, media } = comparison.detail;
  const year = releaseYear(release.date);

  return (
    <Shell className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-text-tertiary">Compared against</div>
          <div className="text-xs font-medium text-text-primary truncate mt-0.5">
            {release.title} · {release.artist}
          </div>
          <div className="text-[11px] text-text-tertiary truncate">
            {[year, describeMedia(media, release.track_count), release.disambiguation].filter(Boolean).join(" · ")}
          </div>
        </div>
        {comparison.alternatives.length > 0 && (
          <select
            value=""
            onChange={(e) => e.target.value && void reload(e.target.value)}
            data-testid="alternative-release"
            aria-label="Compare against a different release"
            className="shrink-0 bg-bg-card border border-border rounded-md px-2 py-1 text-[10px] text-text-secondary max-w-[14rem]"
          >
            <option value="">Try another release…</option>
            {comparison.alternatives.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
                {releaseYear(r.date) ? ` (${releaseYear(r.date)})` : ""} — {r.track_count} tracks
              </option>
            ))}
          </select>
        )}
      </div>

      <p className="text-[11px] text-text-secondary">{diagnose(rows, comparison, album.tracks.length)}</p>

      {/* Capped so the two title columns stay paired instead of drifting to
          opposite edges of a wide window. */}
      <div className="max-w-3xl flex flex-col gap-0.5">
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-text-tertiary pt-1 pb-0.5">
          <span className="w-5 shrink-0" />
          <span className="flex-1 min-w-0">Your files</span>
          <span className="flex-1 min-w-0">MusicBrainz</span>
          <span className="w-14 shrink-0" />
        </div>

        {rows.map((row, i) => (
          <Fragment key={row.key}>
            {media.length > 1 && row.mb && row.mb.disc_number !== rows[i - 1]?.mb?.disc_number && (
              <div className="text-[10px] font-medium text-text-tertiary pt-2 pb-0.5">Disc {row.mb.disc_number}</div>
            )}
            <ComparisonTrackRow row={row} />
          </Fragment>
        ))}
      </div>

      <p className="text-[10px] text-text-tertiary pt-1">
        Searched “{comparison.query_artist} – {comparison.query_album}”
      </p>
    </Shell>
  );
};

const Shell = ({ className, children }: { className: string; children: React.ReactNode }) => (
  <div data-testid="release-comparison" className={`mt-3 pt-3 border-t border-border-subtle ${className}`}>
    {children}
  </div>
);
