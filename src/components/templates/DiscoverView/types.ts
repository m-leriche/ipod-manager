export interface DiscoverAlbum {
  name: string;
  artist_name: string;
  image_url: string | null;
  listeners: number;
  url: string;
}

export interface DiscoverSection {
  seed_artist: string;
  albums: DiscoverAlbum[];
}

export type SeedStrategy = "random" | "most_played" | "recently_played" | "recently_added";
