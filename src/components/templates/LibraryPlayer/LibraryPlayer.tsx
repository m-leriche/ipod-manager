import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { ColumnBrowser } from "../../organisms/ColumnBrowser/ColumnBrowser";
import { TrackTable } from "../../organisms/TrackTable/TrackTable";
import { TrackDetailPanel } from "../../organisms/TrackDetailPanel/TrackDetailPanel";
import { useProgress } from "../../../contexts/ProgressContext";
import type {
  LibraryTrack,
  ArtistSummary,
  AlbumSummary,
  GenreSummary,
  LibraryFilter,
  LibraryScanProgress,
} from "../../../types/library";

// ── Helpers to derive column lists from tracks ──────────────────

const deriveGenres = (tracks: LibraryTrack[]): GenreSummary[] => {
  const map = new Map<string, number>();
  for (const t of tracks) {
    if (!t.genre) continue;
    map.set(t.genre, (map.get(t.genre) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, track_count]) => ({ name, track_count }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

const deriveArtists = (tracks: LibraryTrack[]): ArtistSummary[] => {
  const map = new Map<string, { count: number; albums: Set<string> }>();
  for (const t of tracks) {
    const name = t.album_artist || t.artist;
    if (!name) continue;
    const entry = map.get(name) ?? { count: 0, albums: new Set() };
    entry.count++;
    if (t.album) entry.albums.add(t.album);
    map.set(name, entry);
  }
  return [...map.entries()]
    .map(([name, { count, albums }]) => ({
      name,
      track_count: count,
      album_count: albums.size,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

const deriveAlbums = (tracks: LibraryTrack[]): AlbumSummary[] => {
  const map = new Map<string, { artist: string; year: number | null; count: number; folder: string }>();
  for (const t of tracks) {
    if (!t.album) continue;
    const artist = t.album_artist || t.artist || "";
    const key = `${artist}::${t.album}`;
    const entry = map.get(key) ?? { artist, year: t.year, count: 0, folder: t.folder_path };
    entry.count++;
    map.set(key, entry);
  }
  return [...map.entries()]
    .map(([key, { artist, year, count, folder }]) => ({
      name: key.split("::").slice(1).join("::"),
      artist,
      year,
      track_count: count,
      folder_path: folder,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

// ── Component ───────────────────────────────────────────────────

export const LibraryPlayer = () => {
  const { start: startProgress, update: updateProgress, finish: finishProgress, fail: failProgress } = useProgress();

  // Column browser filter state
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);

  // Track table state
  const [sortBy, setSortBy] = useState("artist");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [search, setSearch] = useState("");
  const [selectedTrack, setSelectedTrack] = useState<LibraryTrack | null>(null);

  // All tracks from the database (unfiltered except by search)
  const [allTracks, setAllTracks] = useState<LibraryTrack[]>([]);
  // Displayed tracks (filtered by all 3 columns + search + sorted)
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  // Column lists — each derived from tracks matching the OTHER columns
  const [genreList, setGenreList] = useState<GenreSummary[]>([]);
  const [artistList, setArtistList] = useState<ArtistSummary[]>([]);
  const [albumList, setAlbumList] = useState<AlbumSummary[]>([]);

  const [hasLibrary, setHasLibrary] = useState<boolean | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── Load all tracks from backend ──────────────────────────────

  const fetchTracks = useCallback(async () => {
    try {
      const filter: LibraryFilter = {
        sort_by: sortBy,
        sort_direction: sortDirection,
        ...(search ? { search } : {}),
      };
      const result = await invoke<LibraryTrack[]>("get_library_tracks", { filter });
      setAllTracks(result ?? []);
    } catch {
      setAllTracks([]);
    }
  }, [sortBy, sortDirection, search]);

  // ── Derive filtered data from allTracks + column selections ───

  useEffect(() => {
    // Filter helpers — must use the same derived field as the column derivation functions
    const matchGenre = (t: LibraryTrack) => !selectedGenre || t.genre === selectedGenre;
    const matchArtist = (t: LibraryTrack) => !selectedArtist || (t.album_artist || t.artist) === selectedArtist;
    const matchAlbum = (t: LibraryTrack) => !selectedAlbum || t.album === selectedAlbum;

    // Tracks for display: match ALL three filters
    setTracks(allTracks.filter((t) => matchGenre(t) && matchArtist(t) && matchAlbum(t)));

    // Genre column: derived from tracks matching Artist + Album (not Genre)
    setGenreList(deriveGenres(allTracks.filter((t) => matchArtist(t) && matchAlbum(t))));

    // Artist column: derived from tracks matching Genre + Album (not Artist)
    setArtistList(deriveArtists(allTracks.filter((t) => matchGenre(t) && matchAlbum(t))));

    // Album column: derived from tracks matching Genre + Artist (not Album)
    setAlbumList(deriveAlbums(allTracks.filter((t) => matchGenre(t) && matchArtist(t))));
  }, [allTracks, selectedGenre, selectedArtist, selectedAlbum]);

  // ── Initial load ──────────────────────────────────────────────

  const loadLibrary = useCallback(async () => {
    await fetchTracks();
    setDataLoaded(true);
  }, [fetchTracks]);

  const checkLibrary = useCallback(async () => {
    try {
      const folders = await invoke<{ id: number; path: string }[]>("get_library_folders");
      const hasFolders = Array.isArray(folders) && folders.length > 0;
      setHasLibrary(hasFolders);
      if (hasFolders) await loadLibrary();
    } catch {
      setHasLibrary(false);
    }
  }, [loadLibrary]);

  useEffect(() => {
    checkLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when sort changes
  useEffect(() => {
    if (dataLoaded) fetchTracks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, sortDirection]);

  // Debounced search
  useEffect(() => {
    if (!dataLoaded) return;
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(fetchTracks, 200);
    return () => clearTimeout(searchTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // ── Column selection handlers ─────────────────────────────────
  // Don't reset other columns — cross-filter lets each column narrow independently

  const handleSelectGenre = useCallback((genre: string | null) => {
    setSelectedGenre(genre);
  }, []);

  const handleSelectArtist = useCallback((artist: string | null) => {
    setSelectedArtist(artist);
  }, []);

  const handleSelectAlbum = useCallback((album: string | null) => {
    setSelectedAlbum(album);
  }, []);

  // ── Add folder ────────────────────────────────────────────────

  const handleAddFolder = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (!selected) return;

    startProgress("Scanning library...", () => invoke("cancel_sync"));

    const unlisten = await listen<LibraryScanProgress>("library-scan-progress", (e) => {
      updateProgress(e.payload.completed, e.payload.total, e.payload.current_file);
    });

    try {
      await invoke("add_library_folder", { path: selected });
      finishProgress("Library scan complete");
      setHasLibrary(true);
      await loadLibrary();
    } catch (e) {
      failProgress(`Scan failed: ${e}`);
    } finally {
      unlisten();
    }
  }, [startProgress, updateProgress, finishProgress, failProgress, loadLibrary]);

  // ── Sort handling ─────────────────────────────────────────────

  const handleSort = useCallback(
    (key: string) => {
      if (key === sortBy) {
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(key);
        setSortDirection("asc");
      }
    },
    [sortBy],
  );

  // ── Track selection ───────────────────────────────────────────

  const handleTrackSelect = useCallback((track: LibraryTrack) => {
    setSelectedTrack(track);
  }, []);

  // ── Render ────────────────────────────────────────────────────

  if (hasLibrary === false) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-bg-card border border-border flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="w-8 h-8 text-text-tertiary"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
              />
            </svg>
          </div>
          <h2 className="text-sm font-medium text-text-primary mb-1">Add your music library</h2>
          <p className="text-xs text-text-tertiary mb-4 max-w-[280px]">
            Choose a folder containing your music to get started.
          </p>
          <button
            onClick={handleAddFolder}
            className="px-5 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors"
          >
            Choose Folder
          </button>
        </div>
      </div>
    );
  }

  if (!dataLoaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-xs text-text-tertiary">Loading library...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        {/* Search bar */}
        <div className="flex items-center gap-3 px-3 py-2 border-b border-border shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-48 px-3 py-1 bg-bg-card border border-border rounded-md text-[11px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-active"
          />
          <div className="flex-1" />
          <span className="text-[10px] text-text-tertiary tabular-nums">{tracks.length} tracks</span>
          <button
            onClick={handleAddFolder}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium text-text-secondary border border-border hover:text-text-primary hover:border-border-active transition-all"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Folder
          </button>
        </div>

        {/* Column browser */}
        <ColumnBrowser
          genres={genreList}
          artists={artistList}
          albums={albumList}
          selectedGenre={selectedGenre}
          selectedArtist={selectedArtist}
          selectedAlbum={selectedAlbum}
          onSelectGenre={handleSelectGenre}
          onSelectArtist={handleSelectArtist}
          onSelectAlbum={handleSelectAlbum}
        />

        {/* Track table */}
        <TrackTable
          tracks={tracks}
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSort={handleSort}
          onTrackSelect={handleTrackSelect}
        />
      </div>

      {selectedTrack && <TrackDetailPanel track={selectedTrack} />}
    </div>
  );
};
