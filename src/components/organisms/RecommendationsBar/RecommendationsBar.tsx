import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePlaylist } from "../../../contexts/PlaylistContext";
import { useToast } from "../../../contexts/ToastContext";
import { Spinner } from "../../atoms/Spinner/Spinner";
import { RecommendationCard } from "./RecommendationCard";
import type { TrackRecommendation } from "./types";

interface RecommendationsBarProps {
  playlistId: number | null;
  smartPlaylistId: number | null;
  /** Changes when the playlist's track set changes, to trigger a refetch. */
  refreshKey: string;
}

export const RecommendationsBar = ({ playlistId, smartPlaylistId, refreshKey }: RecommendationsBarProps) => {
  const { addTracks } = usePlaylist();
  const toast = useToast();
  const [recs, setRecs] = useState<TrackRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);

  // Only regular playlists can have tracks added; smart playlists are rule-driven.
  const canAdd = playlistId !== null;

  useEffect(() => {
    if (playlistId === null && smartPlaylistId === null) {
      setRecs([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    invoke<TrackRecommendation[]>("get_playlist_recommendations", { playlistId, smartPlaylistId })
      .then((result) => {
        if (!cancelled) setRecs(result);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [playlistId, smartPlaylistId, refreshKey]);

  const handleAdd = useCallback(
    async (rec: TrackRecommendation) => {
      if (playlistId === null || rec.track_id === null) return;
      setAddingId(rec.track_id);
      try {
        await addTracks(playlistId, [rec.track_id]);
        setRecs((prev) => prev.filter((r) => r.track_id !== rec.track_id));
      } catch (e) {
        toast.error(`Failed to add track: ${e}`);
      } finally {
        setAddingId(null);
      }
    },
    [playlistId, addTracks, toast],
  );

  if (playlistId === null && smartPlaylistId === null) return null;

  return (
    <div className="shrink-0 border-t border-border bg-bg-secondary">
      <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-accent">
          <path d="M11 3a1 1 0 0 1 .96.73l.86 3.02 3.02.86a1 1 0 0 1 0 1.92l-3.02.86-.86 3.02a1 1 0 0 1-1.92 0l-.86-3.02-3.02-.86a1 1 0 0 1 0-1.92l3.02-.86.86-3.02A1 1 0 0 1 11 3zm7 9a.75.75 0 0 1 .72.54l.4 1.34 1.34.4a.75.75 0 0 1 0 1.44l-1.34.4-.4 1.34a.75.75 0 0 1-1.44 0l-.4-1.34-1.34-.4a.75.75 0 0 1 0-1.44l1.34-.4.4-1.34A.75.75 0 0 1 18 12z" />
        </svg>
        <span className="text-[11px] font-medium text-text-secondary">Recommended</span>
        {loading && <Spinner />}
      </div>

      <div className="px-3 pb-2 min-h-[58px]">
        {error ? (
          <p className="text-[11px] text-text-tertiary py-3">Couldn't load recommendations.</p>
        ) : !loading && recs.length === 0 ? (
          <p className="text-[11px] text-text-tertiary py-3">
            {canAdd ? "No suggestions yet — add a few songs to get recommendations." : "No suggestions yet."}
          </p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {recs.map((rec) => (
              <RecommendationCard
                key={`${rec.artist}|${rec.title}`}
                rec={rec}
                canAdd={canAdd}
                onAdd={handleAdd}
                adding={rec.track_id !== null && addingId === rec.track_id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
