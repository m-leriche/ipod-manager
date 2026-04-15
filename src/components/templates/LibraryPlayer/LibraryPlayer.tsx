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
  BrowserData,
  LibraryFilter,
  LibraryScanProgress,
} from "../../../types/library";

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
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedTrack, setSelectedTrack] = useState<LibraryTrack | null>(null);

  // All data from backend (pre-filtered by column selections)
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [genreList, setGenreList] = useState<GenreSummary[]>([]);
  const [artistList, setArtistList] = useState<ArtistSummary[]>([]);
  const [albumList, setAlbumList] = useState<AlbumSummary[]>([]);

  const [hasLibrary, setHasLibrary] = useState<boolean | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fetchIdRef = useRef(0);

  // ── Debounce search input ─────────────────────────────────────

  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(searchTimerRef.current);
  }, [search]);

  // ── Fetch all browser data from backend ───────────────────────

  const fetchBrowserData = useCallback(async () => {
    const id = ++fetchIdRef.current;
    try {
      const filter: LibraryFilter = {
        sort_by: sortBy,
        sort_direction: sortDirection,
        ...(selectedGenre ? { genre: selectedGenre } : {}),
        ...(selectedArtist ? { artist: selectedArtist } : {}),
        ...(selectedAlbum ? { album: selectedAlbum } : {}),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      };
      const data = await invoke<BrowserData>("get_library_browser_data", { filter });
      if (id !== fetchIdRef.current) return;
      setTracks(data.tracks);
      setGenreList(data.genres);
      setArtistList(data.artists);
      setAlbumList(data.albums);
    } catch {
      if (id !== fetchIdRef.current) return;
      setTracks([]);
      setGenreList([]);
      setArtistList([]);
      setAlbumList([]);
    }
  }, [sortBy, sortDirection, selectedGenre, selectedArtist, selectedAlbum, debouncedSearch]);

  // ── Initial load ──────────────────────────────────────────────

  const checkLibrary = useCallback(async () => {
    try {
      const folders = await invoke<{ id: number; path: string }[]>("get_library_folders");
      const hasFolders = Array.isArray(folders) && folders.length > 0;
      setHasLibrary(hasFolders);
      if (hasFolders) {
        await fetchBrowserData();
        setDataLoaded(true);
      }
    } catch {
      setHasLibrary(false);
    }
  }, [fetchBrowserData]);

  useEffect(() => {
    checkLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Re-fetch when any filter/sort changes ─────────────────────

  useEffect(() => {
    if (dataLoaded) fetchBrowserData();
  }, [dataLoaded, fetchBrowserData]);

  // ── Column selection handlers ─────────────────────────────────

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
      await fetchBrowserData();
      setDataLoaded(true);
    } catch (e) {
      failProgress(`Scan failed: ${e}`);
    } finally {
      unlisten();
    }
  }, [startProgress, updateProgress, finishProgress, failProgress, fetchBrowserData]);

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
