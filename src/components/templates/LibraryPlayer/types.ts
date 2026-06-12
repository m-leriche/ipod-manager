export interface AlbumGenreQuery {
  artist: string;
  album: string;
  current_genre: string | null;
}

export interface AlbumGenreResult {
  artist: string;
  album: string;
  current_genre: string | null;
  /** "; "-joined suggestion, or null when no source had usable genres. */
  suggested_genres: string | null;
  source: "lastfm_album" | "lastfm_artist" | "musicbrainz" | null;
}

export interface GenreLookupOutcome {
  results: AlbumGenreResult[];
  cancelled: boolean;
}

export interface GenreLookupProgress {
  completed: number;
  total: number;
  current: string;
}

export interface AcceptedGenre {
  result: AlbumGenreResult;
  genre: string;
}
