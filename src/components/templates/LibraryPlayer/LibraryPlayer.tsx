import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ColumnBrowser } from "../../organisms/ColumnBrowser/ColumnBrowser";
import { TrackTable } from "../../organisms/TrackTable/TrackTable";
import { TrackDetailPanel } from "../../organisms/TrackDetailPanel/TrackDetailPanel";
import { useProgress } from "../../../contexts/ProgressContext";
import { usePlayback } from "../../../contexts/PlaybackContext";
import type {
  LibraryTrack,
  ArtistSummary,
  AlbumSummary,
  GenreSummary,
  BrowserData,
  LibraryFilter,
  LibraryScanProgress,
  ImportProgress,
  ImportResult,
} from "../../../types/library";
import { getCachedLibrary, setCachedLibrary } from "./helpers";

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
  const isActiveRef = useRef(isActive);
  const [isDragOver, setIsDragOver] = useState(false);

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

  // ── Keep isActive ref in sync ──────────────────────────────────

  useEffect(() => {
    isActiveRef.current = isActive;
    if (!isActive) setIsDragOver(false);
  }, [isActive]);

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

  // ── Choose library location ────────────────────────────────────

  const handleChooseLibrary = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false, title: "Choose library location" });
    if (!selected) return;

    startProgress("Scanning library...", () => invoke("cancel_sync"));

    const unlisten = await listen<LibraryScanProgress>("library-scan-progress", (e) => {
      updateProgress(e.payload.completed, e.payload.total, e.payload.current_file);
    });

    try {
      await invoke("set_library_location", { path: selected });
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

  // ── Drag-and-drop import ───────────────────────────────────────

  const handleDrop = useCallback(
    async (paths: string[]) => {
      let location = await invoke<string | null>("get_library_location");
      if (!location) {
        const selected = await open({
          directory: true,
          multiple: false,
          title: "Choose library location",
        });
        if (!selected) return;
        await invoke("set_library_location", { path: selected });
        location = selected;
      }

      startProgress("Importing to library...", () => invoke("cancel_sync"));

      const unlistenImport = await listen<ImportProgress>("import-progress", (e) => {
        updateProgress(e.payload.completed, e.payload.total, e.payload.current_file);
      });

      const unlistenScan = await listen<LibraryScanProgress>("library-scan-progress", (e) => {
        updateProgress(e.payload.completed, e.payload.total, e.payload.current_file);
      });

      try {
        const result = await invoke<ImportResult>("import_to_library", { paths });
        const msg =
          result.copied > 0
            ? `Imported ${result.copied} track${result.copied !== 1 ? "s" : ""}${result.skipped > 0 ? `, ${result.skipped} skipped` : ""}`
            : result.skipped > 0
              ? `${result.skipped} track${result.skipped !== 1 ? "s" : ""} already in library`
              : "No audio files found";
        finishProgress(msg);
        setHasLibrary(true);
        await fetchBrowserData();
        setDataLoaded(true);
      } catch (e) {
        failProgress(`Import failed: ${e}`);
      } finally {
        unlistenImport();
        unlistenScan();
      }
    },
    [startProgress, updateProgress, finishProgress, failProgress, fetchBrowserData],
  );

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | null = null;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (!active || !isActiveRef.current) return;
        if (event.payload.type === "enter") {
          setIsDragOver(true);
        } else if (event.payload.type === "leave") {
          setIsDragOver(false);
        } else if (event.payload.type === "drop") {
          setIsDragOver(false);
          if (event.payload.paths.length > 0) {
            handleDrop(event.payload.paths);
          }
        }
      })
      .then((fn) => {
        if (active) unlisten = fn;
        else fn();
      });

    return () => {
      active = false;
      unlisten?.();
    };
  }, [handleDrop]);

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
          onPlay={handlePlayColumn}
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
