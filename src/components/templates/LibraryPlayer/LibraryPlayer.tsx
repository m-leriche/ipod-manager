import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ColumnBrowser } from "../../organisms/ColumnBrowser/ColumnBrowser";
import { TrackTable } from "../../organisms/TrackTable/TrackTable";
import { TrackDetailPanel } from "../../organisms/TrackDetailPanel/TrackDetailPanel";
import { LibraryStats } from "../LibraryStats/LibraryStats";
import { LibraryStatusBar } from "./LibraryStatusBar";
import { useProgress } from "../../../contexts/ProgressContext";
import { usePlayback } from "../../../contexts/PlaybackContext";
import { useLibraryImport } from "./useLibraryImport";
import type {
  LibraryTrack,
  ArtistSummary,
  AlbumSummary,
  GenreSummary,
  BrowserData,
  LibraryFilter,
} from "../../../types/library";
import { getCachedLibrary, setCachedLibrary } from "./helpers";

const COLUMN_BROWSER_KEY = "crate-show-column-browser";
const INFO_PANEL_KEY = "crate-show-info-panel";
const STATS_PANEL_KEY = "crate-show-stats-panel";

// ── Component ───────────────────────────────────────────────────

export const LibraryPlayer = ({
  onRefreshRef,
  isActive = true,
}: {
  onRefreshRef?: React.MutableRefObject<(() => void) | null>;
  isActive?: boolean;
}) => {
  const { start: startProgress, update: updateProgress, finish: finishProgress, fail: failProgress } = useProgress();
  const { playTrack } = usePlayback();
  const playAfterFetchRef = useRef(false);

  // Column browser filter state
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);

  // Track table state
  const [sortBy, setSortBy] = useState("artist");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<number>>(new Set());

  // All data from backend (pre-filtered by column selections)
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [genreList, setGenreList] = useState<GenreSummary[]>([]);
  const [artistList, setArtistList] = useState<ArtistSummary[]>([]);
  const [albumList, setAlbumList] = useState<AlbumSummary[]>([]);

  const [hasLibrary, setHasLibrary] = useState<boolean | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Panel visibility (persisted)
  const [showColumnBrowser, setShowColumnBrowser] = useState(
    () => localStorage.getItem(COLUMN_BROWSER_KEY) !== "false",
  );
  const [showInfoPanel, setShowInfoPanel] = useState(() => localStorage.getItem(INFO_PANEL_KEY) !== "false");
  const [showStatsPanel, setShowStatsPanel] = useState(() => localStorage.getItem(STATS_PANEL_KEY) === "true");
  const [libraryPath, setLibraryPath] = useState<string | null>(null);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fetchIdRef = useRef(0);

  // ── Derived selected tracks ───────────────────────────────────

  const selectedTracks = useMemo(() => tracks.filter((t) => selectedTrackIds.has(t.id)), [tracks, selectedTrackIds]);

  // Prune stale selections when tracks change
  useEffect(() => {
    const currentIds = new Set(tracks.map((t) => t.id));
    setSelectedTrackIds((prev) => {
      const pruned = new Set([...prev].filter((id) => currentIds.has(id)));
      return pruned.size === prev.size ? prev : pruned;
    });
  }, [tracks]);

  // ── Debounce search input ─────────────────────────────────────

  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(searchTimerRef.current);
  }, [search]);

  // ── Keep isActive ref in sync ──────────────────────────────────

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
      if (!selectedGenre && !selectedArtist && !selectedAlbum && !debouncedSearch) {
        setCachedLibrary({ hasLibrary: true, browserData: data, cachedAt: Date.now() });
      }
      if (playAfterFetchRef.current && data.tracks.length > 0) {
        playAfterFetchRef.current = false;
        playTrack(data.tracks[0], data.tracks);
      }
    } catch {
      if (id !== fetchIdRef.current) return;
      playAfterFetchRef.current = false;
      setTracks([]);
      setGenreList([]);
      setArtistList([]);
      setAlbumList([]);
    }
  }, [sortBy, sortDirection, selectedGenre, selectedArtist, selectedAlbum, debouncedSearch, playTrack]);

  // ── Initial load ──────────────────────────────────────────────

  const checkLibrary = useCallback(async () => {
    // Load cached data first for instant render
    const cached = await getCachedLibrary();
    // Always fetch library path for stats panel
    invoke<string | null>("get_library_location")
      .then((loc) => setLibraryPath(loc))
      .catch(() => {});
    if (cached) {
      setHasLibrary(cached.hasLibrary);
      if (cached.hasLibrary) {
        setTracks(cached.browserData.tracks);
        setGenreList(cached.browserData.genres);
        setArtistList(cached.browserData.artists);
        setAlbumList(cached.browserData.albums);
        setDataLoaded(true);
        // Background revalidation happens via the useEffect that watches dataLoaded
        return;
      }
    }

    // No cache (first launch) — fetch from backend
    try {
      const location = await invoke<string | null>("get_library_location");
      setLibraryPath(location);
      const hasLocation = !!location;
      setHasLibrary(hasLocation);
      if (hasLocation) {
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

  // Expose refresh callback to parent
  useEffect(() => {
    if (onRefreshRef) onRefreshRef.current = fetchBrowserData;
    return () => {
      if (onRefreshRef) onRefreshRef.current = null;
    };
  }, [onRefreshRef, fetchBrowserData]);

  // ── Re-fetch when any filter/sort changes ─────────────────────

  useEffect(() => {
    if (dataLoaded) fetchBrowserData();
  }, [dataLoaded, fetchBrowserData]);

  // ── Refresh on library file reorganization ────────────────────

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<number>("library-files-reorganized", () => {
      fetchBrowserData();
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [fetchBrowserData]);

  // ── Column selection handlers ─────────────────────────────────

  const handleSelectGenre = useCallback((genre: string | null) => {
    setSelectedGenre(genre);
  }, []);

  const handleSelectArtist = useCallback((artist: string | null) => {
    setSelectedArtist(artist);
  }, []);

  const handleSelectAlbum = useCallback((album: string | null) => {
    setSelectedAlbum(album);
    if (album) {
      setSortBy("track_number");
      setSortDirection("asc");
    }
  }, []);

  const handlePlayColumn = useCallback(() => {
    playAfterFetchRef.current = true;
    fetchBrowserData();
  }, [fetchBrowserData]);

  // ── Import / drag-and-drop ─────────────────────────────────────

  const { isDragOver, handleChooseLibrary } = useLibraryImport(
    isActive,
    startProgress,
    updateProgress,
    finishProgress,
    failProgress,
    fetchBrowserData,
    setHasLibrary,
    setDataLoaded,
  );

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

  const handleTrackSelect = useCallback((_track: LibraryTrack) => {
    // Last-clicked track kept for playback context (not used for detail panel anymore)
  }, []);

  const handleSelectionChange = useCallback((ids: Set<number>) => {
    setSelectedTrackIds(ids);
  }, []);

  const toggleColumnBrowser = useCallback(() => {
    setShowColumnBrowser((prev) => {
      localStorage.setItem(COLUMN_BROWSER_KEY, String(!prev));
      return !prev;
    });
  }, []);

  const toggleInfoPanel = useCallback(() => {
    setShowInfoPanel((prev) => {
      localStorage.setItem(INFO_PANEL_KEY, String(!prev));
      return !prev;
    });
  }, []);

  const toggleStatsPanel = useCallback(() => {
    setShowStatsPanel((prev) => {
      localStorage.setItem(STATS_PANEL_KEY, String(!prev));
      return !prev;
    });
  }, []);

  // ── Render ────────────────────────────────────────────────────

  if (hasLibrary === false) {
    return (
      <div className="relative flex items-center justify-center h-full">
        <div className="text-center">
          <div
            className={`w-16 h-16 mx-auto mb-4 rounded-2xl border flex items-center justify-center transition-colors ${isDragOver ? "bg-accent/10 border-accent" : "bg-bg-card border-border"}`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className={`w-8 h-8 transition-colors ${isDragOver ? "text-accent" : "text-text-tertiary"}`}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
              />
            </svg>
          </div>
          <h2
            className={`text-sm font-medium mb-1 transition-colors ${isDragOver ? "text-accent" : "text-text-primary"}`}
          >
            {isDragOver ? "Drop to import" : "Add your music library"}
          </h2>
          <p className="text-xs text-text-tertiary mb-4 max-w-[280px]">
            {isDragOver
              ? "Files will be organized by Artist and Album"
              : "Choose a folder or drag files here to get started."}
          </p>
          {!isDragOver && (
            <button
              onClick={handleChooseLibrary}
              className="px-5 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors"
            >
              Choose Folder
            </button>
          )}
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
    <div className="relative flex h-full">
      {isDragOver && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-bg-primary/80 backdrop-blur-sm border-2 border-dashed border-accent rounded-lg pointer-events-none">
          <div className="text-center">
            <div className="text-2xl text-accent mb-2">+</div>
            <div className="text-xs font-medium text-accent">Drop to import</div>
            <div className="text-[10px] text-text-tertiary mt-1">Files will be organized by Artist / Album</div>
          </div>
        </div>
      )}
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
        </div>

        {/* Column browser (toggleable) */}
        {showColumnBrowser && (
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
            onPlay={handlePlayColumn}
          />
        )}

        {/* Track table */}
        <TrackTable
          tracks={tracks}
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSort={handleSort}
          onTrackSelect={handleTrackSelect}
          onSelectionChange={handleSelectionChange}
          onTracksDeleted={fetchBrowserData}
        />

        {/* Status bar */}
        <LibraryStatusBar
          selectedTracks={selectedTracks}
          showColumnBrowser={showColumnBrowser}
          showInfoPanel={showInfoPanel}
          showStatsPanel={showStatsPanel}
          onToggleColumnBrowser={toggleColumnBrowser}
          onToggleInfoPanel={toggleInfoPanel}
          onToggleStatsPanel={toggleStatsPanel}
        />
      </div>

      {showInfoPanel && <TrackDetailPanel tracks={selectedTracks} onSave={fetchBrowserData} />}
      {showStatsPanel && (
        <div className="w-[320px] shrink-0 border-l border-border bg-bg-secondary flex flex-col overflow-hidden">
          <LibraryStats libraryPath={libraryPath} />
        </div>
      )}
    </div>
  );
};
