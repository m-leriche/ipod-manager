import type { DiscoveredRelease } from "../../../types/releases";

export interface NewReleasesPopoverProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}

export interface ArtistGroup {
  artistName: string;
  releases: DiscoveredRelease[];
}
