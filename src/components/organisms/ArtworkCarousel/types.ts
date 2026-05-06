import type { AlbumSummary } from "../../../types/library";
import type { AlbumSortMode } from "../AlbumGrid/types";

export interface ArtworkCarouselProps {
  albums: AlbumSummary[];
  selectedAlbum: string | null;
  onSelectAlbum: (name: string | null) => void;
  onPlayAlbum: (name: string) => void;
  sortMode?: AlbumSortMode;
  onSortModeChange?: (mode: AlbumSortMode) => void;
}

export interface CarouselItemProps {
  album: AlbumSummary;
  offset: number;
  onClick: () => void;
  onDoubleClick: () => void;
}
