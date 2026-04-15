import { AlbumArtwork } from "../../atoms/AlbumArtwork/AlbumArtwork";
import { usePlayback } from "../../../contexts/PlaybackContext";
import type { LibraryTrack, AlbumSummary } from "../../../types/library";

interface AlbumDetailProps {
  album: AlbumSummary;
  tracks: LibraryTrack[];
  onBack: () => void;
}

const formatDuration = (secs: number): string => {
  if (!isFinite(secs) || secs < 0) return "—";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export const AlbumDetail = ({ album, tracks, onBack }: AlbumDetailProps) => {
  const { state, playTrack, playAlbum } = usePlayback();

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {/* Header */}
      <div className="p-6 flex gap-6">
        <AlbumArtwork folderPath={album.folder_path} size="lg" />
        <div className="flex flex-col justify-end min-w-0">
          <button
            onClick={onBack}
            className="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors self-start mb-2"
          >
            ← Back
          </button>
          <h2 className="text-lg font-semibold text-text-primary truncate">{album.name}</h2>
          <div className="text-xs text-text-secondary mt-0.5">
            {album.artist}
            {album.year && ` · ${album.year}`}
            {` · ${album.track_count} track${album.track_count !== 1 ? "s" : ""}`}
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => playAlbum(tracks)}
              className="px-4 py-1.5 rounded-full bg-text-primary text-bg-primary text-[11px] font-medium hover:bg-text-primary/90 transition-colors"
            >
              Play
            </button>
            <button
              onClick={() => {
                const shuffled = [...tracks].sort(() => Math.random() - 0.5);
                playAlbum(shuffled);
              }}
              className="px-4 py-1.5 rounded-full border border-border text-[11px] font-medium text-text-secondary hover:text-text-primary hover:border-border-active transition-colors"
            >
              Shuffle
            </button>
          </div>
        </div>
      </div>

      {/* Track list */}
      <div className="px-6 pb-6">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-text-tertiary w-10 text-center">
                #
              </th>
              <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-text-tertiary text-left">
                Title
              </th>
              <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-text-tertiary text-right">
                Time
              </th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((track) => {
              const isPlaying = state.currentTrack?.id === track.id;
              return (
                <tr
                  key={track.id}
                  onDoubleClick={() => playTrack(track, tracks)}
                  className={`cursor-default select-none transition-colors ${
                    isPlaying ? "bg-accent/5" : "hover:bg-bg-hover/50"
                  }`}
                >
                  <td className="px-3 py-[7px] text-[11px] tabular-nums text-center">
                    {isPlaying ? (
                      <div className="flex items-center justify-center gap-[2px] h-3">
                        <span className="w-[3px] bg-accent rounded-full animate-equalizer-1" />
                        <span className="w-[3px] bg-accent rounded-full animate-equalizer-2" />
                        <span className="w-[3px] bg-accent rounded-full animate-equalizer-3" />
                      </div>
                    ) : (
                      <span className="text-text-tertiary">{track.track_number || "—"}</span>
                    )}
                  </td>
                  <td
                    className={`px-3 py-[7px] text-xs font-medium truncate ${isPlaying ? "text-accent" : "text-text-primary"}`}
                  >
                    {track.title || track.file_name}
                  </td>
                  <td className="px-3 py-[7px] text-[11px] text-text-tertiary tabular-nums text-right">
                    {formatDuration(track.duration_secs)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
