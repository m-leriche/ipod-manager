import type { AlbumSummary } from "../../../types/library";

export interface AlbumGridProps {
  albums: AlbumSummary[];
  selectedAlbum: string | null;
  onSelectAlbum: (album: string | null) => void;
  onPlayAlbum?: (albumName: string) => void;
}
