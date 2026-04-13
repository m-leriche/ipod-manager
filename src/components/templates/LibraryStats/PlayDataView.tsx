import { useState, useMemo } from "react";
import type { RockboxPlayData } from "../../../types/libstats";
import type { PlayDataSort } from "./types";
import { formatTrackDuration, formatNumber, sortPlayData } from "./helpers";

const SORT_OPTIONS: { value: PlayDataSort; label: string }[] = [
  { value: "most_played", label: "Most Played" },
  { value: "least_recent", label: "Least Recent" },
  { value: "highest_rated", label: "Highest Rated" },
  { value: "never_played", label: "Never Played" },
];

export const PlayDataView = ({ playData }: { playData: RockboxPlayData }) => {
  const [sort, setSort] = useState<PlayDataSort>("most_played");

  const playedCount = useMemo(() => playData.tracks.filter((t) => t.playcount > 0).length, [playData.tracks]);
  const neverPlayedCount = playData.total_tracks - playedCount;

  const sortedTracks = useMemo(() => sortPlayData(playData.tracks, sort), [playData.tracks, sort]);

  const avgRating = useMemo(() => {
    const rated = playData.tracks.filter((t) => t.rating > 0);
    if (rated.length === 0) return null;
    return (rated.reduce((sum, t) => sum + t.rating, 0) / rated.length).toFixed(1);
  }, [playData.tracks]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Summary row */}
      <div className="flex gap-5 px-5 py-2.5 bg-bg-secondary border border-border rounded-2xl shrink-0 text-xs font-medium mb-3">
        <span className="text-text-secondary">{formatNumber(playData.total_tracks)} tracks</span>
        <span className="text-success">{formatNumber(playedCount)} played</span>
        <span className="text-warning">{formatNumber(neverPlayedCount)} never played</span>
        {avgRating && <span className="text-text-tertiary">avg rating {avgRating}</span>}
      </div>

      {/* Sort controls */}
      <div className="flex gap-1.5 shrink-0 mb-3">
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setSort(opt.value)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
              sort === opt.value
                ? "bg-bg-card text-text-primary border border-border-active"
                : "text-text-tertiary border border-transparent hover:text-text-secondary"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <span className="flex-1" />
        <span className="text-[11px] text-text-tertiary self-center">{formatNumber(sortedTracks.length)} tracks</span>
      </div>

      {/* Track table */}
      {sortedTracks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-text-tertiary text-xs">No tracks match this filter</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto border border-border rounded-2xl">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-bg-secondary z-10">
              <tr className="text-left text-[10px] text-text-tertiary uppercase tracking-wider">
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Artist</th>
                <th className="px-4 py-2.5 font-medium">Album</th>
                <th className="px-4 py-2.5 font-medium text-right">Plays</th>
                <th className="px-4 py-2.5 font-medium text-right">Rating</th>
                <th className="px-4 py-2.5 font-medium text-right">Length</th>
                <th className="px-4 py-2.5 font-medium text-right">Recency</th>
              </tr>
            </thead>
            <tbody>
              {sortedTracks.map((track, i) => (
                <tr
                  key={`${track.filename}-${i}`}
                  className="border-t border-border-subtle hover:bg-bg-hover transition-colors"
                >
                  <td className="px-4 py-2 text-text-primary truncate max-w-[200px]">
                    {track.title || track.filename.split("/").pop() || "Unknown"}
                  </td>
                  <td className="px-4 py-2 text-text-secondary truncate max-w-[160px]">{track.artist || "Unknown"}</td>
                  <td className="px-4 py-2 text-text-secondary truncate max-w-[160px]">{track.album || "Unknown"}</td>
                  <td className="px-4 py-2 text-right text-text-secondary tabular-nums">
                    {track.playcount > 0 ? formatNumber(track.playcount) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right text-text-secondary tabular-nums">
                    {track.rating > 0 ? track.rating : "—"}
                  </td>
                  <td className="px-4 py-2 text-right text-text-tertiary tabular-nums">
                    {track.length_ms > 0 ? formatTrackDuration(track.length_ms) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right text-text-tertiary tabular-nums">
                    {track.playcount === 0 ? "Never" : `#${formatNumber(track.lastplayed_rank)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
