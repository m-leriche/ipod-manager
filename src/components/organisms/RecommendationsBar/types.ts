export interface TrackRecommendation {
  title: string;
  artist: string;
  album: string | null;
  image_url: string | null;
  in_library: boolean;
  track_id: number | null;
  score: number;
}
