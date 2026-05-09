import { useState, useEffect, useCallback, useRef, useMemo, startTransition } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { usePlayback } from "../../../contexts/PlaybackContext";
import { usePlaylist } from "../../../contexts/PlaylistContext";
import { useToast } from "../../../contexts/ToastContext";
import type {
  LibraryTrack,
  GenreSummary,
  ArtistSummary,
  AlbumSummary,
  BrowserData,
  PaginatedBrowserData,
  PaginatedTracks,
  LibraryFilter,
} from "../../../types/library";
import type { AlbumSortMode } from "../../organisms/AlbumGrid/types";
import { getCachedLibrary, setCachedLibrary } from "./helpers";

const PAGE_SIZE = 500;
const FLAGGED_FILTER_KEY = "crate-flagged-filter";
const SORT_BY_KEY = "crate-sort-by";
const SORT_DIR_KEY = "crate-sort-direction";
const ALBUM_SORT_MODE_KEY = "crate-album-sort-mode";

export const useLibraryData = (onRefreshRef?: React.MutableRefObject<(() => void) | null>) => {
  const { playTrack } = usePlayback();
  const { activePlaylistId, activePlaylistTracks, activeSmartPlaylistId, activeSmartPlaylistTracks } = usePlaylist();
  const toast = useToast();
  const playAfterFetchRef = useRef(false);

  // Column browser filter state
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set());
  const [selectedArtists, setSelectedArtists] = useState<Set<string>>(new Set());
  const [selectedAlbums, setSelectedAlbums] = useState<Set<string>>(new Set());

  // Track table state (persisted)
  const [sortBy, setSortBy] = useState(() => localStorage.getItem(SORT_BY_KEY) || "artist");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(
    () => (localStorage.getItem(SORT_DIR_KEY) as "asc" | "desc") || "asc",
  );
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(() => localStorage.getItem(FLAGGED_FILTER_KEY) === "true");
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<number>>(new Set());

  // Backend data
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [genreList, setGenreList] = useState<GenreSummary[]>([]);
  const [artistList, setArtistList] = useState<ArtistSummary[]>([]);
  const [albumList, setAlbumList] = useState<AlbumSummary[]>([]);
  const [totalTrackCount, setTotalTrackCount] = useState(0);
  const isLoadingPageRef = useRef(false);

  // Library state
  const [hasLibrary, setHasLibrary] = useState<boolean | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [isBackgroundScanning, setIsBackgroundScanning] = useState(false);
  const [libraryPath, setLibraryPath] = useState<string | null>(null);
  const [albumSortMode, setAlbumSortMode] = useState<AlbumSortMode>(
    () => (localStorage.getItem(ALBUM_SORT_MODE_KEY) as AlbumSortMode) || "album",
  );

  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fetchIdRef = useRef(0);
  const unfilteredCacheRef = useRef<{ data: BrowserData; sortBy: string; sortDirection: string } | null>(null);

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

  const displayedTracks = useMemo(() => {
    const isPlaylistView = activeSmartPlaylistId !== null || activePlaylistId !== null;
    const baseTracks = isPlaylistView
      ? activeSmartPlaylistId !== null
        ? activeSmartPlaylistTracks
        : activePlaylistTracks
      : tracks;
    if (!debouncedSearch || !isPlaylistView) return baseTracks;
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

  // ── Fetch all browser data from backend ───────────────────────

  const fetchBrowserData = useCallback(async () => {
    const id = ++fetchIdRef.current;
    const isUnfiltered =
      selectedGenres.size === 0 &&
      selectedArtists.size === 0 &&
      selectedAlbums.size === 0 &&
      !debouncedSearch &&
      !flaggedOnly;

    if (
      isUnfiltered &&
      unfilteredCacheRef.current &&
      unfilteredCacheRef.current.sortBy === sortBy &&
      unfilteredCacheRef.current.sortDirection === sortDirection
    ) {
      const cached = unfilteredCacheRef.current.data;
      setTracks(cached.tracks);
      setGenreList(cached.genres);
      setArtistList(cached.artists);
      setAlbumList(cached.albums);
    }

    try {
      const filter: LibraryFilter = {
        sort_by: sortBy,
        sort_direction: sortDirection,
        offset: 0,
        limit: PAGE_SIZE,
        ...(selectedGenres.size > 0 ? { genre: [...selectedGenres] } : {}),
        ...(selectedArtists.size > 0 ? { artist: [...selectedArtists] } : {}),
        ...(selectedAlbums.size > 0 ? { album: [...selectedAlbums] } : {}),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(flaggedOnly ? { flagged_only: true } : {}),
      };
      const data = await invoke<PaginatedBrowserData>("get_library_browser_data_paginated", { filter });
      if (id !== fetchIdRef.current) return;
      startTransition(() => {
        setTracks(data.tracks.tracks);
        setTotalTrackCount(data.tracks.total_count);
        setGenreList(data.genres);
        setArtistList(data.artists);
        setAlbumList(data.albums);
      });
      if (isUnfiltered) {
        const browserData: BrowserData = {
          tracks: data.tracks.tracks,
          genres: data.genres,
          artists: data.artists,
          albums: data.albums,
        };
        unfilteredCacheRef.current = { data: browserData, sortBy, sortDirection };
        setCachedLibrary({ hasLibrary: true, browserData, cachedAt: Date.now() });
      }
      if (playAfterFetchRef.current && data.tracks.tracks.length > 0) {
        playAfterFetchRef.current = false;
        playTrack(data.tracks.tracks[0], data.tracks.tracks);
      }
    } catch (e) {
      if (id !== fetchIdRef.current) return;
      console.error("Failed to load library data:", e);
      playAfterFetchRef.current = false;
      setTracks([]);
      setTotalTrackCount(0);
      setGenreList([]);
      setArtistList([]);
      setAlbumList([]);
    }
  }, [sortBy, sortDirection, selectedGenres, selectedArtists, selectedAlbums, debouncedSearch, flaggedOnly, playTrack]);

  // ── Background incremental rescan ──────────────────────────────

  const backgroundRescan = useCallback(async () => {
    setIsBackgroundScanning(true);
    try {
      const result = await invoke<{ changed: number; removed: number; total_scanned: number }>("background_rescan");
      if (result.changed > 0 || result.removed > 0) {
        const parts: string[] = [];
        if (result.changed > 0) parts.push(`${result.changed} updated`);
        if (result.removed > 0) parts.push(`${result.removed} removed`);
        toast.success(`Library updated — ${parts.join(", ")}`);
      }
    } catch {
      // Background scan is non-critical
    } finally {
      setIsBackgroundScanning(false);
    }
  }, [toast]);

  // ── Load more tracks (scroll pagination) ──────────────────────

  const loadMoreTracks = useCallback(
    async (startIndex: number) => {
      if (isLoadingPageRef.current || startIndex >= totalTrackCount) return;
      if (activePlaylistId !== null || activeSmartPlaylistId !== null) return;
      const generation = fetchIdRef.current;
      isLoadingPageRef.current = true;
      try {
        const filter: LibraryFilter = {
          sort_by: sortBy,
          sort_direction: sortDirection,
          offset: startIndex,
          limit: PAGE_SIZE,
          skip_count: true,
          ...(selectedGenres.size > 0 ? { genre: [...selectedGenres] } : {}),
          ...(selectedArtists.size > 0 ? { artist: [...selectedArtists] } : {}),
          ...(selectedAlbums.size > 0 ? { album: [...selectedAlbums] } : {}),
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(flaggedOnly ? { flagged_only: true } : {}),
        };
        const page = await invoke<PaginatedTracks>("get_library_tracks_page", { filter });
        if (generation !== fetchIdRef.current) return;
        setTracks((prev) => [...prev, ...page.tracks]);
      } catch (e) {
        console.error("Failed to load tracks page:", e);
      } finally {
        isLoadingPageRef.current = false;
      }
    },
    [
      totalTrackCount,
      activePlaylistId,
      activeSmartPlaylistId,
      sortBy,
      sortDirection,
      selectedGenres,
      selectedArtists,
      selectedAlbums,
      debouncedSearch,
      flaggedOnly,
    ],
  );

  // ── Initial load ──────────────────────────────────────────────

  const checkLibrary = useCallback(async () => {
    const cached = await getCachedLibrary();
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
        unfilteredCacheRef.current = {
          data: cached.browserData,
          sortBy: localStorage.getItem(SORT_BY_KEY) || "artist",
          sortDirection: localStorage.getItem(SORT_DIR_KEY) || "asc",
        };
        setDataLoaded(true);
        backgroundRescan();
        return;
      }
    }

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
  }, [fetchBrowserData, backgroundRescan]);

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

  // Re-fetch when any filter/sort changes
  useEffect(() => {
    if (dataLoaded) fetchBrowserData();
  }, [dataLoaded, fetchBrowserData]);

  // Refresh on library file reorganization
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

  // Update play count in place
  useEffect(() => {
    const handler = (e: Event) => {
      const { trackId } = (e as CustomEvent<{ trackId: number }>).detail;
      setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, play_count: t.play_count + 1 } : t)));
    };
    window.addEventListener("play-count-updated", handler);
    return () => window.removeEventListener("play-count-updated", handler);
  }, []);

  // ── Column selection handlers ─────────────────────────────────

  const handleSelectGenre = useCallback((genres: Set<string>) => {
    setSelectedGenres(genres);
  }, []);

  const handleSelectArtist = useCallback((artists: Set<string>) => {
    setSelectedArtists(artists);
  }, []);

  const handleSelectAlbum = useCallback((albums: Set<string>) => {
    setSelectedAlbums(albums);
    if (albums.size > 0) {
      setSortBy("track_number");
      setSortDirection("asc");
    } else {
      setSortBy(localStorage.getItem(SORT_BY_KEY) || "artist");
      setSortDirection((localStorage.getItem(SORT_DIR_KEY) as "asc" | "desc") || "asc");
    }
  }, []);

  const handlePlayColumn = useCallback(() => {
    playAfterFetchRef.current = true;
    fetchBrowserData();
  }, [fetchBrowserData]);

  // ── Toggle flagged filter ─────────────────────────────────────

  const toggleFlaggedOnly = useCallback(() => {
    setFlaggedOnly((prev) => {
      const next = !prev;
      localStorage.setItem(FLAGGED_FILTER_KEY, String(next));
      return next;
    });
  }, []);

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

  const handleTrackSelect = useCallback((_track: LibraryTrack) => {}, []);
  const handleSelectionChange = useCallback((ids: Set<number>) => {
    setSelectedTrackIds(ids);
  }, []);

  // ── Album sort mode (persisted) ───────────────────────────────

  const handleAlbumSortModeChange = useCallback((mode: AlbumSortMode) => {
    setAlbumSortMode(mode);
    localStorage.setItem(ALBUM_SORT_MODE_KEY, mode);
  }, []);

  return {
    // Data
    tracks,
    genreList,
    artistList,
    albumList,
    totalTrackCount,
    hasLibrary,
    setHasLibrary,
    dataLoaded,
    setDataLoaded,
    isBackgroundScanning,
    libraryPath,
    displayedTracks,
    selectedTracks,
    // Search / filter / sort
    search,
    setSearch,
    sortBy,
    sortDirection,
    flaggedOnly,
    toggleFlaggedOnly,
    searchInputRef,
    // Column selections
    selectedGenres,
    selectedArtists,
    selectedAlbums,
    handleSelectGenre,
    handleSelectArtist,
    handleSelectAlbum,
    handlePlayColumn,
    // Sort
    handleSort,
    albumSortMode,
    handleAlbumSortModeChange,
    // Selection
    handleSelectionChange,
    handleTrackSelect,
    // Data operations
    fetchBrowserData,
    loadMoreTracks,
  };
};
