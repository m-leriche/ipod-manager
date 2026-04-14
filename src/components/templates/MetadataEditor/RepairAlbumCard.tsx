import { confidenceLabel, confidenceColor, totalIssueCount } from "./helpers";
import type { AlbumRepairReport } from "./types";

interface RepairAlbumCardProps {
  album: AlbumRepairReport;
  selected: boolean;
  onClick: () => void;
}

export const RepairAlbumCard = ({ album, selected, onClick }: RepairAlbumCardProps) => {
  const issues = totalIssueCount(album);
  const hasMatch = album.selected_release !== null;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-xl transition-all ${
        selected ? "bg-bg-card border border-border-active" : "border border-transparent hover:bg-bg-card/50"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-text-primary truncate">{album.artist || "[No Artist]"}</div>
          <div className="text-[11px] text-text-secondary truncate">{album.album || "[No Album]"}</div>
        </div>
        <span
          className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-medium ${confidenceColor(album.match_confidence)}`}
        >
          {confidenceLabel(album.match_confidence)}
        </span>
      </div>

      {hasMatch && issues > 0 && (
        <div className="flex gap-2 mt-1.5">
          {album.issue_summary.error_count > 0 && (
            <span className="text-[10px] text-danger">{album.issue_summary.error_count} errors</span>
          )}
          {album.issue_summary.warning_count > 0 && (
            <span className="text-[10px] text-warning">{album.issue_summary.warning_count} warnings</span>
          )}
          {album.issue_summary.info_count > 0 && (
            <span className="text-[10px] text-accent">{album.issue_summary.info_count} info</span>
          )}
        </div>
      )}

      {hasMatch && issues === 0 && <div className="text-[10px] text-success mt-1">All metadata matches</div>}

      {!hasMatch && <div className="text-[10px] text-text-tertiary mt-1">No MusicBrainz match found</div>}

      <div className="text-[10px] text-text-tertiary mt-0.5">
        {album.track_matches.length} {album.track_matches.length === 1 ? "track" : "tracks"}
      </div>
    </button>
  );
};
