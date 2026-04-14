import { useMemo } from "react";
import { RepairTrackRow } from "./RepairTrackRow";
import { confidenceLabel, confidenceColor, issueKey, totalIssueCount } from "./helpers";
import type { AlbumRepairReport, MbRelease } from "./types";

interface RepairDetailPanelProps {
  album: AlbumRepairReport;
  acceptedFixes: Set<string>;
  onToggleFix: (key: string) => void;
  onAcceptAll: () => void;
  onClearAll: () => void;
  onSwitchRelease: (mbid: string) => void;
  switching: boolean;
}

export const RepairDetailPanel = ({
  album,
  acceptedFixes,
  onToggleFix,
  onAcceptAll,
  onClearAll,
  onSwitchRelease,
  switching,
}: RepairDetailPanelProps) => {
  const release = album.selected_release;
  const issues = totalIssueCount(album);

  const acceptableCount = useMemo(() => {
    let count = 0;
    for (const tm of album.track_matches) {
      for (const issue of tm.issues) {
        if (issue.suggested_value) count++;
      }
    }
    return count;
  }, [album]);

  const acceptedInAlbum = useMemo(() => {
    let count = 0;
    for (const tm of album.track_matches) {
      for (const issue of tm.issues) {
        if (acceptedFixes.has(issueKey(issue))) count++;
      }
    }
    return count;
  }, [album, acceptedFixes]);

  return (
    <div className="flex-1 min-w-0 bg-bg-secondary border border-border rounded-2xl flex flex-col min-h-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-text-primary">
              {album.artist} — {album.album}
            </div>
            {release && (
              <div className="text-[10px] text-text-tertiary mt-0.5">
                MusicBrainz: {release.release.title}
                {release.release.date && ` (${release.release.date.split("-")[0]})`}
                {" · "}
                {release.tracks.length} tracks
              </div>
            )}
          </div>
          <span
            className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-medium ${confidenceColor(album.match_confidence)}`}
          >
            {confidenceLabel(album.match_confidence)}
          </span>
        </div>

        {/* Alternative release selector */}
        {album.alternative_releases.length > 0 && (
          <div className="mt-2">
            <label className="text-[10px] text-text-tertiary">Switch release:</label>
            <select
              className="ml-2 text-[11px] bg-bg-card border border-border rounded-lg px-2 py-1 text-text-secondary"
              value=""
              disabled={switching}
              onChange={(e) => {
                if (e.target.value) onSwitchRelease(e.target.value);
              }}
            >
              <option value="">Select alternative...</option>
              {album.alternative_releases.map((r: MbRelease) => (
                <option key={r.id} value={r.id}>
                  {r.title} {r.date ? `(${r.date.split("-")[0]})` : ""} — {r.track_count} tracks (score: {r.score})
                </option>
              ))}
            </select>
            {switching && <span className="text-[10px] text-text-tertiary ml-2">Loading...</span>}
          </div>
        )}

        {/* Action buttons */}
        {issues > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={onAcceptAll}
              disabled={acceptedInAlbum === acceptableCount}
              className="px-3 py-1 bg-bg-card border border-border text-text-secondary rounded-lg text-[11px] hover:not-disabled:text-text-primary hover:not-disabled:border-border-active disabled:opacity-30 transition-all"
            >
              Accept All ({acceptableCount})
            </button>
            <button
              onClick={onClearAll}
              disabled={acceptedInAlbum === 0}
              className="px-3 py-1 bg-bg-card border border-border text-text-secondary rounded-lg text-[11px] hover:not-disabled:text-text-primary hover:not-disabled:border-border-active disabled:opacity-30 transition-all"
            >
              Clear All
            </button>
            <span className="text-[10px] text-text-tertiary">
              {acceptedInAlbum} of {acceptableCount} fixes accepted
            </span>
          </div>
        )}
      </div>

      {/* Track list */}
      <div className="flex-1 overflow-y-auto">
        {!release && (
          <div className="flex items-center justify-center h-full text-text-tertiary text-xs">
            No MusicBrainz match — cannot compare tracks
          </div>
        )}

        {release &&
          album.track_matches.map((tm, i) => (
            <RepairTrackRow
              key={tm.local_track.file_path || i}
              trackMatch={tm}
              acceptedFixes={acceptedFixes}
              onToggleFix={onToggleFix}
            />
          ))}

        {/* Missing tracks section */}
        {album.missing_tracks.length > 0 && (
          <div className="border-t border-border">
            <div className="px-3 py-2 text-[11px] font-medium text-text-tertiary uppercase tracking-widest">
              Missing from your library
            </div>
            {album.missing_tracks.map((mt) => (
              <div key={`missing-${mt.position}`} className="flex items-center gap-2 px-3 py-1.5">
                <span className="text-[11px] text-text-tertiary w-6 text-right shrink-0">{mt.position}</span>
                <span className="text-[11px] text-text-tertiary flex-1 truncate">{mt.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
