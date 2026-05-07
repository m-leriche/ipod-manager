export interface NewReleasesModalProps {
  onClose: () => void;
}

export interface ArtistGroup {
  artistName: string;
  releases: Array<{
    id: number;
    title: string;
    releaseType: string | null;
    releaseDate: string | null;
    inLibrary: boolean;
    mbReleaseGroupId: string;
  }>;
}
