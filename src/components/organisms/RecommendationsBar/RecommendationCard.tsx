import { useState } from "react";
import { AlbumArtwork } from "../../atoms/AlbumArtwork/AlbumArtwork";
import type { TrackRecommendation } from "./types";

interface RecommendationCardProps {
  rec: TrackRecommendation;
  /** Show an add button for owned tracks (regular playlists only). */
  canAdd: boolean;
  onAdd: (rec: TrackRecommendation) => void;
  onDismiss: (rec: TrackRecommendation) => void;
  adding: boolean;
}

export const RecommendationCard = ({ rec, canAdd, onAdd, onDismiss, adding }: RecommendationCardProps) => {
  const [imgError, setImgError] = useState(false);
  const showAdd = canAdd && rec.in_library && rec.track_id !== null;

  return (
    <div
      title={`${rec.title} — ${rec.artist}${rec.in_library ? "" : " (not in library)"}`}
      className={`group relative shrink-0 w-[200px] flex items-center gap-2 rounded-lg border border-border/60 bg-bg-card/40 px-2 py-1.5 transition-colors ${
        rec.in_library ? "" : "opacity-70"
      }`}
    >
      <Artwork rec={rec} imgError={imgError} onImgError={() => setImgError(true)} />

      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium text-text-primary truncate">{rec.title}</div>
        <div className="text-[10px] text-text-tertiary truncate">{rec.artist}</div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {showAdd ? (
          <button
            onClick={() => onAdd(rec)}
            disabled={adding}
            aria-label={`Add ${rec.title} to playlist`}
            title="Add to playlist"
            className="w-6 h-6 rounded-full bg-accent/15 text-accent hover:bg-accent hover:text-white flex items-center justify-center transition-colors disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
          </button>
        ) : (
          !rec.in_library && (
            <span
              className="text-[8px] font-semibold uppercase tracking-wide text-text-tertiary/60 border border-border/60 rounded px-1 py-0.5"
              title="Not in your library"
            >
              New
            </span>
          )
        )}
        <button
          onClick={() => onDismiss(rec)}
          aria-label={`Dismiss ${rec.title}`}
          title="Not interested — show another"
          className="w-5 h-5 rounded-full text-text-tertiary/60 hover:text-text-primary hover:bg-bg-elevated flex items-center justify-center transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3 h-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

/** Local cover art for owned tracks; Last.fm artwork (or a placeholder) otherwise. */
const Artwork = ({
  rec,
  imgError,
  onImgError,
}: {
  rec: TrackRecommendation;
  imgError: boolean;
  onImgError: () => void;
}) => {
  if (rec.folder_path) {
    return <AlbumArtwork folderPath={rec.folder_path} size="sm" className="rounded" />;
  }
  if (rec.image_url && !imgError) {
    return (
      <div className="w-8 h-8 shrink-0 rounded overflow-hidden bg-bg-elevated">
        <img src={rec.image_url} alt="" loading="lazy" onError={onImgError} className="w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div className="w-8 h-8 shrink-0 rounded overflow-hidden bg-bg-elevated flex items-center justify-center">
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
    </div>
  );
};
