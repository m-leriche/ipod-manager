import type { AlbumSummary, ArtistSummary } from "../../../types/library";
import type { AlbumSortMode } from "../AlbumGrid/types";

export interface ArtworkCarouselProps {
  albums: AlbumSummary[];
  selectedAlbum: string | null;
  onSelectAlbum: (name: string | null) => void;
  onPlayAlbum: (name: string) => void;
  sortMode?: AlbumSortMode;
  onSortModeChange?: (mode: AlbumSortMode) => void;
  artists?: ArtistSummary[];
  selectedArtist?: string | null;
  onSelectArtist?: (artist: string | null) => void;
  lyricsOverlay?: boolean;
  onLyricsOverlayDismiss?: () => void;
}

export interface AlbumArtProps {
  album: AlbumSummary;
  isCenter: boolean;
}

/** Cover pose at a given absolute offset from the center cover. */
export interface TransformConfig {
  x: number;
  ry: number;
  z: number;
  scale: number;
  opacity: number;
}

export interface DensityStepperProps {
  sideCount: number;
  onChange: (sideCount: number) => void;
}
