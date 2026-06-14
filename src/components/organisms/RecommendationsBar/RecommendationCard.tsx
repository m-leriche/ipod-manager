import { useState } from "react";
import type { TrackRecommendation } from "./types";

interface RecommendationCardProps {
  rec: TrackRecommendation;
  /** Show an add button for owned tracks (regular playlists only). */
  canAdd: boolean;
  onAdd: (rec: TrackRecommendation) => void;
  adding: boolean;
}

export const RecommendationCard = ({ rec, canAdd, onAdd, adding }: RecommendationCardProps) => {
  const [imgError, setImgError] = useState(false);
  const showAdd = canAdd && rec.in_library && rec.track_id !== null;

  return (
    <div
      title={`${rec.title} — ${rec.artist}${rec.in_library ? "" : " (not in library)"}`}
      className={`group relative shrink-0 w-[200px] flex items-center gap-2 rounded-lg border border-border/60 bg-bg-card/40 px-2 py-1.5 transition-colors ${
        rec.in_library ? "" : "opacity-70"
      }`}
    >
      <div className="w-9 h-9 shrink-0 rounded overflow-hidden bg-bg-elevated flex items-center justify-center">
        {rec.image_url && !imgError ? (
          <img
            src={rec.image_url}
            alt=""
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
            className="w-4 h-4 text-text-tertiary/40"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"
            />
          </svg>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium text-text-primary truncate">{rec.title}</div>
        <div className="text-[10px] text-text-tertiary truncate">{rec.artist}</div>
      </div>

      {showAdd ? (
        <button
          onClick={() => onAdd(rec)}
          disabled={adding}
          aria-label={`Add ${rec.title} to playlist`}
          title="Add to playlist"
          className="shrink-0 w-6 h-6 rounded-full bg-accent/15 text-accent hover:bg-accent hover:text-white flex items-center justify-center transition-colors disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
        </button>
      ) : (
        !rec.in_library && (
          <span
            className="shrink-0 text-[8px] font-semibold uppercase tracking-wide text-text-tertiary/60 border border-border/60 rounded px-1 py-0.5"
            title="Not in your library"
          >
            New
          </span>
        )
      )}
    </div>
  );
};
