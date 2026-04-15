import { AlbumCard } from "../../molecules/AlbumCard/AlbumCard";
import type { AlbumSummary } from "../../../types/library";

interface AlbumGridProps {
  albums: AlbumSummary[];
  onSelectAlbum: (album: AlbumSummary) => void;
  onPlayAlbum: (album: AlbumSummary) => void;
}

export const AlbumGrid = ({ albums, onSelectAlbum, onPlayAlbum }: AlbumGridProps) => (
  <div className="flex-1 min-h-0 overflow-y-auto p-4">
    {albums.length === 0 ? (
      <div className="flex items-center justify-center h-48 text-text-tertiary text-xs">No albums found</div>
    ) : (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
        {albums.map((album) => (
          <AlbumCard
            key={`${album.artist}-${album.name}`}
            album={album}
            onClick={() => onSelectAlbum(album)}
            onPlay={() => onPlayAlbum(album)}
          />
        ))}
      </div>
    )}
  </div>
);
