export interface SyncedLine {
  time: number; // seconds
  text: string;
}

export interface TrackLyrics {
  track_id: number;
  lyrics: string | null;
  synced_lyrics: string | null;
  source: string;
}
