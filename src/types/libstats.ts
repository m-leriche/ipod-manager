export interface LibraryStats {
  total_tracks: number;
  total_size: number;
  total_duration_secs: number;
  average_bitrate_kbps: number;
  artist_count: number;
  album_count: number;
  format_breakdown: FormatEntry[];
  genre_distribution: DistributionEntry[];
  sample_rate_distribution: DistributionEntry[];
  year_distribution: YearEntry[];
  oldest_year: number | null;
  newest_year: number | null;
}

export interface FormatEntry {
  format: string;
  count: number;
  size: number;
  percentage: number;
}

export interface DistributionEntry {
  label: string;
  count: number;
}

export interface YearEntry {
  year: number;
  count: number;
}

export interface LibStatsScanProgress {
  total: number;
  completed: number;
  current_file: string;
}

export interface RockboxPlayData {
  total_tracks: number;
  tracks: RockboxTrack[];
  max_serial: number;
  rating_distribution: RatingEntry[];
}

export interface RockboxTrack {
  title: string;
  artist: string;
  album: string;
  filename: string;
  genre: string;
  year: number;
  track_number: number;
  bitrate: number;
  length_ms: number;
  playcount: number;
  rating: number;
  playtime_ms: number;
  lastplayed: number;
  lastplayed_rank: number;
}

export interface RatingEntry {
  rating: number;
  count: number;
}
