import { AlbumArtwork } from "../../atoms/AlbumArtwork/AlbumArtwork";
import type { LibraryTrack } from "../../../types/library";

interface NowPlayingInfoProps {
  track: LibraryTrack;
}

export const NowPlayingInfo = ({ track }: NowPlayingInfoProps) => (
  <div className="flex items-center gap-3 min-w-0">
    <AlbumArtwork folderPath={track.folder_path} size="md" />
    <div className="min-w-0">
      <div className="text-xs font-medium text-text-primary truncate">{track.title || track.file_name}</div>
      <div className="text-[11px] text-text-secondary truncate">{track.artist || "Unknown Artist"}</div>
    </div>
  </div>
);
