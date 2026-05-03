import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AlbumGrid } from "../../organisms/AlbumGrid/AlbumGrid";
import type { AlbumSortMode } from "../../organisms/AlbumGrid/types";
import { useResizableHeight } from "../../organisms/AlbumGrid/useResizableHeight";
import { ColumnBrowser } from "../../organisms/ColumnBrowser/ColumnBrowser";
import { TrackTable } from "../../organisms/TrackTable/TrackTable";
import { TrackDetailPanel } from "../../organisms/TrackDetailPanel/TrackDetailPanel";
import { LibraryStats } from "../LibraryStats/LibraryStats";
import { PlaylistSidebar } from "./PlaylistSidebar";
import { SmartPlaylistEditor } from "../../organisms/SmartPlaylistEditor/SmartPlaylistEditor";
import { LibraryStatusBar } from "./LibraryStatusBar";
import { useProgress } from "../../../contexts/ProgressContext";
import { usePlayback } from "../../../contexts/PlaybackContext";
import { usePlaylist } from "../../../contexts/PlaylistContext";
import { useLibraryImport } from "./useLibraryImport";
import type {
  LibraryTrack,
  ArtistSummary,
  AlbumSummary,
  GenreSummary,
  BrowserData,
  LibraryFilter,
  SmartPlaylist,
} from "../../../types/library";
import { getCachedLibrary, setCachedLibrary } from "./helpers";

const FLAGGED_FILTER_KEY = "crate-flagged-filter";
const SORT_BY_KEY = "crate-sort-by";
const SORT_DIR_KEY = "crate-sort-direction";
const ALBUM_SORT_MODE_KEY = "crate-album-sort-mode";

// ── Component ───────────────────────────────────────────────────

export const LibraryPlayer = ({
  onRefreshRef,
  isActive = true,
  onRepairMetadata,
  showColumnBrowser,
  showInfoPanel,
  showStatsPanel,
  showPlaylistSidebar,
  showAlbumGrid = false,
}: {
  onRefreshRef?: React.MutableRefObject<(() => void) | null>;
  isActive?: boolean;
  onRepairMetadata?: (tracks: LibraryTrack[]) => void;
  showColumnBrowser: boolean;
  showInfoPanel: boolean;
  showStatsPanel: boolean;
  showPlaylistSidebar: boolean;
  showAlbumGrid?: boolean;
}) => {
  const { start: startProgress, update: updateProgress, finish: finishProgress, fail: failProgress } = useProgress();
  const gridResize = useResizableHeight();
  const {
    playTrack,
    addToQueue,
    state: { libraryAvailable },
  } = usePlayback();
  const {
    playlists,
    activePlaylistId,
    activePlaylistTracks,
    setActivePlaylist,
    addTracks: addToPlaylistCtx,
  } = usePlaylist();
  const playAfterFetchRef = useRef(false);

  // Column browser filter state
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);

  // Track table state (persisted)
  const [sortBy, setSortBy] = useState(() => localStorage.getItem(SORT_BY_KEY) || "artist");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(
    () => (localStorage.getItem(SORT_DIR_KEY) as "asc" | "desc") || "asc",
  );
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(() => localStorage.getItem(FLAGGED_FILTER_KEY) === "true");
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<number>>(new Set());

  // All data from backend (pre-filtered by column selections)
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [genreList, setGenreList] = useState<GenreSummary[]>([]);
  const [artistList, setArtistList] = useState<ArtistSummary[]>([]);
  const [albumList, setAlbumList] = useState<AlbumSummary[]>([]);

  const [hasLibrary, setHasLibrary] = useState<boolean | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  const [libraryPath, setLibraryPath] = useState<string | null>(null);
  const [smartPlaylistEditing, setSmartPlaylistEditing] = useState<SmartPlaylist | null>(null);
  const [smartPlaylistCreating, setSmartPlaylistCreating] = useState(false);
  const [albumSortMode, setAlbumSortMode] = useState<AlbumSortMode>(
    () => (localStorage.getItem(ALBUM_SORT_MODE_KEY) as AlbumSortMode) || "album",
  );

  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fetchIdRef = useRef(0);

  // ── Global Cmd+F to focus search ─────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ── Displayed tracks (library, playlist, or smart playlist) ────

  const { activeSmartPlaylistId, activeSmartPlaylistTracks, createSmartPlaylist, updateSmartPlaylist } = usePlaylist();

  const displayedTracks = useMemo(() => {
    const baseTracks =
      activeSmartPlaylistId !== null
        ? activeSmartPlaylistTracks
        : activePlaylistId !== null
          ? activePlaylistTracks
          : tracks;
    if (!debouncedSearch) return baseTracks;
    const q = debouncedSearch.toLowerCase();
    return baseTracks.filter(
      (t) =>
        (t.title ?? t.file_name ?? "").toLowerCase().includes(q) ||
        (t.artist ?? "").toLowerCase().includes(q) ||
        (t.album ?? "").toLowerCase().includes(q),
    );
  }, [
    activeSmartPlaylistId,
    activeSmartPlaylistTracks,
    activePlaylistId,
    activePlaylistTracks,
    tracks,
    debouncedSearch,
  ]);

  // ── Derived selected tracks ───────────────────────────────────

  const selectedTracks = useMemo(
    () => displayedTracks.filter((t) => selectedTrackIds.has(t.id)),
    [displayedTracks, selectedTrackIds],
  );

  // Prune stale selections when displayed tracks change
  useEffect(() => {
    const currentIds = new Set(displayedTracks.map((t) => t.id));
    setSelectedTrackIds((prev) => {
      const pruned = new Set([...prev].filter((id) => currentIds.has(id)));
      return pruned.size === prev.size ? prev : pruned;
    });
  }, [displayedTracks]);

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
        ...(flaggedOnly ? { flagged_only: true } : {}),
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
    } catch (e) {
      if (id !== fetchIdRef.current) return;
      console.error("Failed to load library data:", e);
      playAfterFetchRef.current = false;
      setTracks([]);
      setGenreList([]);
      setArtistList([]);
      setAlbumList([]);
    }
  }, [sortBy, sortDirection, selectedGenre, selectedArtist, selectedAlbum, debouncedSearch, flaggedOnly, playTrack]);

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

  const toggleFlaggedOnly = useCallback(() => {
    setFlaggedOnly((prev) => {
      const next = !prev;
      localStorage.setItem(FLAGGED_FILTER_KEY, String(next));
      return next;
    });
  }, []);

  const handleFlagTracks = useCallback(
    async (trackIds: number[], flagged: boolean) => {
      try {
        await invoke("flag_tracks", { trackIds, flagged });
        await fetchBrowserData();
      } catch (e) {
        alert(`Failed to update sync flags: ${e}`);
      }
    },
    [fetchBrowserData],
  );

  const handleRateTracks = useCallback(
    async (trackIds: number[], rating: number) => {
      try {
        await invoke("rate_tracks", { trackIds, rating });
        await fetchBrowserData();
      } catch (e) {
        alert(`Failed to update ratings: ${e}`);
      }
    },
    [fetchBrowserData],
  );

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

  // ── Update play count in place when a track finishes ──────────

  useEffect(() => {
    const handler = (e: Event) => {
      const { trackId } = (e as CustomEvent<{ trackId: number }>).detail;
      setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, play_count: t.play_count + 1 } : t)));
    };
    window.addEventListener("play-count-updated", handler);
    return () => window.removeEventListener("play-count-updated", handler);
  }, []);

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
    } else {
      // Restore user's persisted sort preference
      setSortBy(localStorage.getItem(SORT_BY_KEY) || "artist");
      setSortDirection((localStorage.getItem(SORT_DIR_KEY) as "asc" | "desc") || "asc");
    }
  }, []);

  const handlePlayColumn = useCallback(() => {
    playAfterFetchRef.current = true;
    fetchBrowserData();
  }, [fetchBrowserData]);

  // ── Column browser context menu handlers ──────────────────────

  const getTracksForColumnAction = useCallback(
    (action: { column: string; value: string }) => {
      return tracks.filter((t) => {
        switch (action.column) {
          case "genre":
            return t.genre === action.value;
          case "artist":
            return t.artist === action.value;
          case "album":
            return t.album === action.value;
          default:
            return false;
        }
      });
    },
    [tracks],
  );

  const handleColumnPlayAll = useCallback(
    (action: { column: string; value: string }) => {
      const matched = getTracksForColumnAction(action);
      if (matched.length > 0) playTrack(matched[0], matched);
    },
    [getTracksForColumnAction, playTrack],
  );

  const handleColumnAddToQueue = useCallback(
    (action: { column: string; value: string }) => {
      const matched = getTracksForColumnAction(action);
      if (matched.length > 0) addToQueue(matched);
    },
    [getTracksForColumnAction, addToQueue],
  );

  const handleColumnAddToPlaylist = useCallback(
    (action: { column: string; value: string }, playlistId: number) => {
      const matched = getTracksForColumnAction(action);
      if (matched.length > 0)
        addToPlaylistCtx(
          playlistId,
          matched.map((t) => t.id),
        );
    },
    [getTracksForColumnAction, addToPlaylistCtx],
  );

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
        setSortDirection((d) => {
          const next = d === "asc" ? "desc" : "asc";
          localStorage.setItem(SORT_DIR_KEY, next);
          return next;
        });
      } else {
        setSortBy(key);
        setSortDirection("asc");
        localStorage.setItem(SORT_BY_KEY, key);
        localStorage.setItem(SORT_DIR_KEY, "asc");
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
      {showPlaylistSidebar && (
        <PlaylistSidebar
          onPlaylistSelect={(id) => {
            setActivePlaylist(id);
          }}
          activePlaylistId={activePlaylistId}
          onSmartPlaylistEdit={(sp) => setSmartPlaylistEditing(sp)}
          onSmartPlaylistCreate={() => setSmartPlaylistCreating(true)}
        />
      )}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        {/* Library offline banner */}
        {!libraryAvailable && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border-b border-yellow-500/20 shrink-0">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-yellow-500 shrink-0">
              <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-[11px] text-yellow-500/90 font-medium">
              Library offline — connect your drive to play music
            </span>
          </div>
        )}

        {/* Search bar */}
        <div className="flex items-center gap-3 px-3 py-2 border-b border-border shrink-0">
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search... (⌘F)"
            className="w-48 px-3 py-1 bg-bg-card border border-border rounded-md text-[11px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-active"
          />
          <button
            onClick={toggleFlaggedOnly}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              flaggedOnly ? "text-accent bg-accent/10" : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill={flaggedOnly ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={2}
              className="w-3 h-3"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 21V3h16l-6 9 6 9H4" />
            </svg>
            To Sync
          </button>
          <div className="flex-1" />
          <span className="text-[10px] text-text-tertiary tabular-nums">{displayedTracks.length} tracks</span>
        </div>

        {/* Column browser or album grid (toggleable, hidden when viewing playlist or smart playlist) */}
        {activePlaylistId === null && activeSmartPlaylistId === null && (
          <>
            {showAlbumGrid ? (
              <>
                <div
                  ref={gridResize.containerRef}
                  style={{ height: `${gridResize.fraction * 100}%` }}
                  className="shrink-0 min-h-0"
                >
                  <AlbumGrid
                    albums={albumList}
                    selectedAlbum={selectedAlbum}
                    onSelectAlbum={handleSelectAlbum}
                    onPlayAlbum={(name) => handleColumnPlayAll({ column: "album", value: name })}
                    sortMode={albumSortMode}
                    onSortModeChange={(mode) => {
                      setAlbumSortMode(mode);
                      localStorage.setItem(ALBUM_SORT_MODE_KEY, mode);
                    }}
                  />
                </div>
                <div
                  onMouseDown={gridResize.onDragStart}
                  className="shrink-0 h-1.5 cursor-row-resize flex items-center justify-center group hover:bg-accent/10 rounded-full transition-colors"
                >
                  <div className="w-8 h-0.5 rounded-full bg-border group-hover:bg-accent/50 transition-colors" />
                </div>
              </>
            ) : (
              showColumnBrowser && (
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
                  onPlayAll={handleColumnPlayAll}
                  onAddAllToQueue={handleColumnAddToQueue}
                  onAddAllToPlaylist={handleColumnAddToPlaylist}
                  playlists={playlists}
                />
              )
            )}
          </>
        )}

        {/* Track table */}
        <TrackTable
          tracks={displayedTracks}
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSort={handleSort}
          onTrackSelect={handleTrackSelect}
          onSelectionChange={handleSelectionChange}
          onTracksDeleted={fetchBrowserData}
          onFlagTracks={handleFlagTracks}
          onRateTracks={handleRateTracks}
          onRepairMetadata={onRepairMetadata}
          activePlaylistId={activePlaylistId}
        />

        {/* Status bar */}
        <LibraryStatusBar selectedTracks={selectedTracks} />
      </div>

      {showInfoPanel && <TrackDetailPanel tracks={selectedTracks} onSave={fetchBrowserData} />}
      {showStatsPanel && (
        <div className="w-[320px] shrink-0 border-l border-border bg-bg-secondary flex flex-col overflow-hidden">
          <LibraryStats libraryPath={libraryPath} />
        </div>
      )}

      {/* Smart playlist editor modal */}
      {(smartPlaylistCreating || smartPlaylistEditing) && (
        <SmartPlaylistEditor
          initialName={smartPlaylistEditing?.name}
          initialRules={smartPlaylistEditing?.rules}
          initialSortBy={smartPlaylistEditing?.sort_by}
          initialSortDirection={smartPlaylistEditing?.sort_direction}
          initialLimit={smartPlaylistEditing?.track_limit}
          onSave={async (name, rules, sortBy, sortDirection, limit) => {
            try {
              if (smartPlaylistEditing) {
                await updateSmartPlaylist(smartPlaylistEditing.id, name, rules, sortBy, sortDirection, limit);
              } else {
                await createSmartPlaylist(name, rules, sortBy, sortDirection, limit);
              }
            } catch (e) {
              alert(`Failed to save smart playlist: ${e}`);
            }
            setSmartPlaylistEditing(null);
            setSmartPlaylistCreating(false);
          }}
          onCancel={() => {
            setSmartPlaylistEditing(null);
            setSmartPlaylistCreating(false);
          }}
        />
      )}
    </div>
  );
};
