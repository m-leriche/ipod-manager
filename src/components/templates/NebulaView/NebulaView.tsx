import { useCallback } from "react";
import { usePlayback } from "../../../contexts/PlaybackContext";
import { Spinner } from "../../atoms/Spinner/Spinner";
import { NebulaCanvas } from "./NebulaCanvas";
import { useNebulaData } from "./useNebulaData";
import type { MapPoint } from "./types";

export const NebulaView = () => {
  const { layout, trackCount, loading, error, reload } = useNebulaData();
  const { playTrack } = usePlayback();

  const handleSelectTrack = useCallback(
    (point: MapPoint) => {
      const genreTracks = layout?.points.filter((p) => p.genre === point.genre).map((p) => p.track);
      playTrack(point.track, genreTracks);
    },
    [layout, playTrack],
  );

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-text-tertiary">
        <Spinner />
        Loading library...
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <p className="text-xs text-text-tertiary">Failed to load library: {error}</p>
        <button
          onClick={() => void reload()}
          className="px-3 py-1.5 rounded-md text-xs font-medium bg-bg-card border border-border text-text-secondary hover:text-text-primary transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!layout) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-xs text-text-tertiary">No tracks in your library yet.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-8 pb-3 shrink-0 flex items-baseline gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Nebula</h2>
        <p className="text-[11px] text-text-tertiary">
          {trackCount.toLocaleString()} tracks · {layout.clusters.length} genres · color = genre · drag = pan · scroll =
          zoom · click = play
        </p>
      </div>
      <div className="flex-1 min-h-0 mx-8 mb-6 rounded-lg border border-border bg-bg-secondary overflow-hidden">
        <NebulaCanvas layout={layout} onSelectTrack={handleSelectTrack} />
      </div>
    </div>
  );
};
