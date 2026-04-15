import { memo } from "react";
import { AlbumArtwork } from "../../atoms/AlbumArtwork/AlbumArtwork";
import type { LibraryTrack } from "../../../types/library";

interface TrackDetailPanelProps {
  track: LibraryTrack;
}

const formatDuration = (secs: number): string => {
  if (!isFinite(secs) || secs < 0) return "—";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const TrackDetailPanel = memo(function TrackDetailPanel({ track }: TrackDetailPanelProps) {
  return (
    <div className="w-[220px] shrink-0 border-l border-border bg-bg-secondary flex flex-col overflow-y-auto">
      {/* Album artwork */}
      <div className="p-4 flex justify-center">
        <AlbumArtwork folderPath={track.folder_path} size="lg" />
      </div>

      {/* Track info */}
      <div className="px-4 pb-4 space-y-3">
        <div>
          <div className="text-xs font-medium text-text-primary truncate">{track.title || track.file_name}</div>
          <div className="text-[11px] text-text-secondary truncate">{track.artist || "Unknown Artist"}</div>
          <div className="text-[11px] text-text-tertiary truncate">{track.album || "Unknown Album"}</div>
        </div>

        <div className="space-y-1.5">
          <DetailRow label="Year" value={track.year?.toString()} />
          <DetailRow label="Genre" value={track.genre} />
          <DetailRow label="Track" value={track.track_number?.toString()} />
          {track.disc_number && <DetailRow label="Disc" value={track.disc_number.toString()} />}
          <DetailRow label="Album Artist" value={track.album_artist} />

          <div className="border-t border-border pt-1.5 mt-2" />

          <DetailRow label="Length" value={formatDuration(track.duration_secs)} />
          <DetailRow label="Size" value={formatSize(track.file_size)} />
          <DetailRow label="Format" value={track.format} />
          {track.bitrate_kbps && <DetailRow label="Bitrate" value={`${track.bitrate_kbps} kbps`} />}
          {track.sample_rate && (
            <DetailRow label="Sample Rate" value={`${(track.sample_rate / 1000).toFixed(1)} kHz`} />
          )}
        </div>
      </div>
    </div>
  );
});

const DetailRow = ({ label, value }: { label: string; value: string | null | undefined }) => {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[10px] text-text-tertiary shrink-0">{label}</span>
      <span className="text-[10px] text-text-secondary text-right truncate">{value}</span>
    </div>
  );
};
