import type { AlbumSummary } from "../../../types/library";

export type AlbumSortMode = "album" | "artist";

export interface AlbumGridProps {
  albums: AlbumSummary[];
  selectedAlbum: string | null;
  onSelectAlbum: (album: string | null) => void;
  onPlayAlbum?: (albumName: string) => void;
  onFixAlbumArt?: (album: AlbumSummary) => void;
  onUploadAlbumArt?: (album: AlbumSummary) => void;
  onFixAllAlbumArt?: () => void;
  isFixingAllArt?: boolean;
  sortMode?: AlbumSortMode;
  onSortModeChange?: (mode: AlbumSortMode) => void;
}
