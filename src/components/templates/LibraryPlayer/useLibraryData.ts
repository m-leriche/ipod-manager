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
import { getSetting, setSetting } from "../../../utils/settings";
import { matchesShortcut } from "../../../utils/shortcuts";

const PAGE_SIZE = 500;
/** Cap on simultaneous page fetches so a fast scrollbar drag can't queue
    dozens of stale pages ahead of the one the user lands on. */
const MAX_INFLIGHT_PAGES = 4;
/** Delay before the launch rescan kicks off, so its disk I/O doesn't compete
    with first paint and provider hydration. */
const BACKGROUND_RESCAN_DELAY_MS = 3_000;

/** Window event fired by Settings when the default sort preferences change. */
export const SORT_SETTINGS_CHANGED_EVENT = "crate:sort-settings-changed";

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
  const [sortBy, setSortBy] = useState(() => getSetting("sortBy"));
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(
    () => getSetting("sortDirection") as "asc" | "desc",
  );
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(() => getSetting("flaggedFilter"));
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<number>>(new Set());

  // Backend data. `tracks` is sparse in library view: pages load on demand at
  // any offset (scrollbar jumps included), so unloaded slots are undefined.
  const [tracks, setTracks] = useState<(LibraryTrack | undefined)[]>([]);
  const [genreList, setGenreList] = useState<GenreSummary[]>([]);
  const [artistList, setArtistList] = useState<ArtistSummary[]>([]);
  const [albumList, setAlbumList] = useState<AlbumSummary[]>([]);
  const [totalTrackCount, setTotalTrackCount] = useState(0);
  const pendingPageOffsetsRef = useRef<Set<number>>(new Set());

  // Library state
  const [hasLibrary, setHasLibrary] = useState<boolean | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [isBackgroundScanning, setIsBackgroundScanning] = useState(false);
  const [libraryPath, setLibraryPath] = useState<string | null>(null);
  const libraryPathRef = useRef<string | null>(null);
  const [albumSortMode, setAlbumSortMode] = useState<AlbumSortMode>(() => getSetting("albumSortMode") as AlbumSortMode);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const rescanTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const disposedRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fetchIdRef = useRef(0);
  const unfilteredCacheRef = useRef<{ data: BrowserData; sortBy: string; sortDirection: string } | null>(null);
  /** Filter fingerprint of the last fetch. When only the sort changed, the
      genre/artist/album aggregates are still valid and only the track page
      needs re-fetching; when neither changed, no fetch is needed at all. */
  const lastAggregatesKeyRef = useRef<string | null>(null);
  const lastSortKeyRef = useRef<string | null>(null);
  /** Latest aggregate lists, mirrored so sort-only cache writes don't need
      the list states in fetchSortedPage's deps (which would re-run the
      refetch effect whenever a list changes). */
  const aggregatesRef = useRef<{
    genres: GenreSummary[];
    artists: ArtistSummary[];
    albums: AlbumSummary[];
    total: number;
  }>({ genres: [], artists: [], albums: [], total: 0 });
  aggregatesRef.current = { genres: genreList, artists: artistList, albums: albumList, total: totalTrackCount };

  // ── Global shortcut (default Cmd+F) to focus search ──────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't steal keystrokes from text fields (the binding may be a bare key)
      const target = e.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (matchesShortcut(e, "focusSearch")) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ── Re-apply default sort when changed in Settings ────────────

  useEffect(() => {
    const handleSortSettingsChanged = () => {
      setSortBy(getSetting("sortBy"));
      setSortDirection(getSetting("sortDirection") as "asc" | "desc");
      setAlbumSortMode(getSetting("albumSortMode") as AlbumSortMode);
    };
    window.addEventListener(SORT_SETTINGS_CHANGED_EVENT, handleSortSettingsChanged);
    return () => window.removeEventListener(SORT_SETTINGS_CHANGED_EVENT, handleSortSettingsChanged);
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
        !!t &&
        ((t.title ?? t.file_name ?? "").toLowerCase().includes(q) ||
          (t.artist ?? "").toLowerCase().includes(q) ||
          (t.album ?? "").toLowerCase().includes(q)),
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
    () => displayedTracks.filter((t): t is LibraryTrack => !!t && selectedTrackIds.has(t.id)),
    [displayedTracks, selectedTrackIds],
  );

  useEffect(() => {
    const currentIds = new Set(displayedTracks.map((t) => t?.id));
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

  const aggregatesKey = JSON.stringify([
    [...selectedGenres],
    [...selectedArtists],
    [...selectedAlbums],
    debouncedSearch,
    flaggedOnly,
  ]);
  const sortFingerprint = JSON.stringify([sortBy, sortDirection]);
  const isUnfiltered =
    selectedGenres.size === 0 &&
    selectedArtists.size === 0 &&
    selectedAlbums.size === 0 &&
    !debouncedSearch &&
    !flaggedOnly;

  const buildFilter = useCallback(
    (offset: number, skipCount?: boolean): LibraryFilter => ({
      sort_by: sortBy,
      sort_direction: sortDirection,
      offset,
      limit: PAGE_SIZE,
      ...(skipCount ? { skip_count: true } : {}),
      ...(selectedGenres.size > 0 ? { genre: [...selectedGenres] } : {}),
      ...(selectedArtists.size > 0 ? { artist: [...selectedArtists] } : {}),
      ...(selectedAlbums.size > 0 ? { album: [...selectedAlbums] } : {}),
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(flaggedOnly ? { flagged_only: true } : {}),
    }),
    [sortBy, sortDirection, selectedGenres, selectedArtists, selectedAlbums, debouncedSearch, flaggedOnly],
  );

  /** Persist the unfiltered view for instant paint on next launch. The
      library location is resolved at write time so the cache is stamped with
      the library the data actually came from — it can change at runtime via
      onboarding or Settings, and a wrong stamp would either kill the instant
      paint or show another library's tracks. */
  const persistUnfilteredCache = useCallback((browserData: BrowserData, totalCount: number) => {
    invoke<string | null>("get_library_location")
      .then((loc) => {
        libraryPathRef.current = loc;
        setCachedLibrary({
          hasLibrary: true,
          browserData,
          totalTrackCount: totalCount,
          cachedAt: Date.now(),
          libraryPath: loc,
        });
      })
      .catch(() => {
        // Unknown location — skip the write rather than mislabel the cache.
      });
  }, []);

  const fetchBrowserData = useCallback(async () => {
    const id = ++fetchIdRef.current;
    pendingPageOffsetsRef.current.clear();

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
      const data = await invoke<PaginatedBrowserData>("get_library_browser_data_paginated", {
        filter: buildFilter(0),
      });
      if (id !== fetchIdRef.current) return;
      // Stamp only after the results actually land — stamping before the
      // await would let a concurrent sort click take the fast path while this
      // fetch's aggregates get discarded, leaving the sidebar lists stale.
      lastAggregatesKeyRef.current = aggregatesKey;
      lastSortKeyRef.current = sortFingerprint;
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
        persistUnfilteredCache(browserData, data.tracks.total_count);
      }
      if (playAfterFetchRef.current && data.tracks.tracks.length > 0) {
        playAfterFetchRef.current = false;
        playTrack(data.tracks.tracks[0], data.tracks.tracks);
      }
    } catch (e) {
      if (id !== fetchIdRef.current) return;
      console.error("Failed to load library data:", e);
      playAfterFetchRef.current = false;
      lastAggregatesKeyRef.current = null;
      lastSortKeyRef.current = null;
      setTracks([]);
      setTotalTrackCount(0);
      setGenreList([]);
      setArtistList([]);
      setAlbumList([]);
    }
  }, [
    buildFilter,
    aggregatesKey,
    sortFingerprint,
    isUnfiltered,
    sortBy,
    sortDirection,
    playTrack,
    persistUnfilteredCache,
  ]);

  /** Re-fetch only the first track page, keeping the aggregate lists and the
      total count. Used when the sort changed but the filters didn't — the
      genre/artist/album aggregates don't depend on sort order, so re-running
      their GROUP BY scans would be wasted work. */
  const fetchSortedPage = useCallback(async () => {
    const id = ++fetchIdRef.current;
    pendingPageOffsetsRef.current.clear();
    try {
      const page = await invoke<PaginatedTracks>("get_library_tracks_page", { filter: buildFilter(0, true) });
      if (id !== fetchIdRef.current) return;
      lastSortKeyRef.current = sortFingerprint;
      startTransition(() => setTracks(page.tracks));
      if (isUnfiltered) {
        // Keep the launch cache in step with the persisted sort setting, so
        // the next launch doesn't paint old-order rows under a new header.
        const { genres, artists, albums, total } = aggregatesRef.current;
        const browserData: BrowserData = { tracks: page.tracks, genres, artists, albums };
        unfilteredCacheRef.current = { data: browserData, sortBy, sortDirection };
        persistUnfilteredCache(browserData, total);
      }
    } catch (e) {
      if (id !== fetchIdRef.current) return;
      console.error("Failed to load sorted page, falling back to full refresh:", e);
      fetchBrowserData();
    }
  }, [buildFilter, sortFingerprint, isUnfiltered, sortBy, sortDirection, persistUnfilteredCache, fetchBrowserData]);

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

  // ── Load tracks page on demand (scroll pagination) ────────────
  // Random access: fetches the page containing `index` directly, so jumping
  // the scrollbar deep into the list never waits on intermediate pages.

  const loadMoreTracks = useCallback(
    async (index: number) => {
      if (index < 0 || index >= totalTrackCount) return;
      if (activePlaylistId !== null || activeSmartPlaylistId !== null) return;
      const offset = Math.floor(index / PAGE_SIZE) * PAGE_SIZE;
      const pending = pendingPageOffsetsRef.current;
      if (pending.has(offset) || pending.size >= MAX_INFLIGHT_PAGES) return;
      const generation = fetchIdRef.current;
      pending.add(offset);
      try {
        const page = await invoke<PaginatedTracks>("get_library_tracks_page", {
          filter: buildFilter(offset, true),
        });
        if (generation !== fetchIdRef.current) return;
        setTracks((prev) => {
          const next = prev.slice();
          // Pad explicitly so the array never has holes (holes are skipped
          // by map/filter, which would make index-based logic inconsistent).
          while (next.length < offset) next.push(undefined);
          for (let i = 0; i < page.tracks.length; i++) next[offset + i] = page.tracks[i];
          return next;
        });
      } catch (e) {
        console.error("Failed to load tracks page:", e);
      } finally {
        // A newer generation owns the set after a filter/sort change — leave it alone.
        if (generation === fetchIdRef.current) pending.delete(offset);
      }
    },
    [totalTrackCount, activePlaylistId, activeSmartPlaylistId, buildFilter],
  );

  // ── Initial load ──────────────────────────────────────────────

  const checkLibrary = useCallback(async () => {
    const [cached, locationResult] = await Promise.all([
      getCachedLibrary(),
      invoke<string | null>("get_library_location").then(
        (loc) => ({ ok: true, loc }) as const,
        (e: unknown) => {
          console.warn("Failed to get library location:", e);
          return { ok: false, loc: null } as const;
        },
      ),
    ]);
    if (locationResult.ok) {
      setLibraryPath(locationResult.loc);
      libraryPathRef.current = locationResult.loc;
    }

    // Use the cache only if it was built from this library — a cache from a
    // previous location (or a restored DB) would show the wrong tracks. If
    // the location lookup failed transiently, still trust the cache: showing
    // the last known library beats flashing first-run onboarding at a user
    // with a full library.
    const cacheMatchesLibrary = locationResult.ok
      ? !!locationResult.loc && cached?.libraryPath === locationResult.loc
      : true;
    if (cached?.hasLibrary && cacheMatchesLibrary) {
      setHasLibrary(true);
      setTracks(cached.browserData.tracks);
      setTotalTrackCount(cached.totalTrackCount ?? cached.browserData.tracks.length);
      setGenreList(cached.browserData.genres);
      setArtistList(cached.browserData.artists);
      setAlbumList(cached.browserData.albums);
      unfilteredCacheRef.current = {
        data: cached.browserData,
        sortBy: getSetting("sortBy"),
        sortDirection: getSetting("sortDirection"),
      };
      setDataLoaded(true);
      // checkLibrary resumes after an await, so the unmount cleanup may have
      // already run — don't schedule a timer nothing will ever clear.
      if (!disposedRef.current) {
        rescanTimerRef.current = setTimeout(backgroundRescan, BACKGROUND_RESCAN_DELAY_MS);
      }
      return;
    }

    if (!locationResult.ok) {
      // No cache and no location answer — leave hasLibrary undecided rather
      // than misdiagnosing a transient failure as "no library configured".
      return;
    }
    const hasLocation = !!locationResult.loc;
    setHasLibrary(hasLocation);
    if (hasLocation) {
      await fetchBrowserData();
      setDataLoaded(true);
    }
  }, [fetchBrowserData, backgroundRescan]);

  useEffect(() => {
    disposedRef.current = false;
    checkLibrary();
    return () => {
      disposedRef.current = true;
      clearTimeout(rescanTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Expose refresh callback to parent
  useEffect(() => {
    if (onRefreshRef) onRefreshRef.current = fetchBrowserData;
    return () => {
      if (onRefreshRef) onRefreshRef.current = null;
    };
  }, [onRefreshRef, fetchBrowserData]);

  // Re-fetch when any filter/sort changes. A sort-only change re-fetches just
  // the track page; a filter change refreshes the aggregates too. Mutations
  // (deletes, metadata saves) call fetchBrowserData directly and always do a
  // full refresh.
  useEffect(() => {
    if (!dataLoaded) return;
    const sameFilters = lastAggregatesKeyRef.current === aggregatesKey;
    const sameSort = lastSortKeyRef.current === sortFingerprint;
    if (sameFilters && sameSort) {
      // Nothing to fetch — but invalidate any in-flight fetch for a different
      // state so its late-arriving results can't be mislabeled as current
      // (e.g. sort A→B→A while B's page fetch is still in the air).
      fetchIdRef.current++;
      pendingPageOffsetsRef.current.clear();
      return;
    }
    if (sameFilters) {
      fetchSortedPage();
    } else {
      fetchBrowserData();
    }
  }, [dataLoaded, fetchBrowserData, fetchSortedPage, aggregatesKey, sortFingerprint]);

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
      const now = Math.floor(Date.now() / 1000);
      setTracks((prev) =>
        prev.map((t) => (t?.id === trackId ? { ...t, play_count: t.play_count + 1, last_played: now } : t)),
      );
    };
    window.addEventListener("play-count-updated", handler);
    return () => window.removeEventListener("play-count-updated", handler);
  }, []);

  // ── Column selection handlers ─────────────────────────────────

  const handleSelectAlbum = useCallback((albums: Set<string>) => {
    setSelectedAlbums(albums);
    if (albums.size > 0) {
      setSortBy("track_number");
      setSortDirection("asc");
    } else {
      setSortBy(getSetting("sortBy"));
      setSortDirection(getSetting("sortDirection") as "asc" | "desc");
    }
  }, []);

  // Selecting in a column resets selections in columns to its right
  // (filters cascade left to right, iTunes-style)
  const handleSelectGenre = useCallback(
    (genres: Set<string>) => {
      setSelectedGenres(genres);
      setSelectedArtists(new Set());
      handleSelectAlbum(new Set());
    },
    [handleSelectAlbum],
  );

  const handleSelectArtist = useCallback(
    (artists: Set<string>) => {
      setSelectedArtists(artists);
      handleSelectAlbum(new Set());
    },
    [handleSelectAlbum],
  );

  const handlePlayColumn = useCallback(() => {
    playAfterFetchRef.current = true;
    fetchBrowserData();
  }, [fetchBrowserData]);

  // ── Toggle flagged filter ─────────────────────────────────────

  const toggleFlaggedOnly = useCallback(() => {
    setFlaggedOnly((prev) => {
      const next = !prev;
      setSetting("flaggedFilter", next);
      return next;
    });
  }, []);

  // ── Sort handling ─────────────────────────────────────────────

  const handleSort = useCallback(
    (key: string) => {
      if (key === sortBy) {
        setSortDirection((d) => {
          const next = d === "asc" ? "desc" : "asc";
          setSetting("sortDirection", next);
          return next;
        });
      } else {
        setSortBy(key);
        setSortDirection("asc");
        setSetting("sortBy", key);
        setSetting("sortDirection", "asc");
      }
    },
    [sortBy],
  );

  // ── Track selection ───────────────────────────────────────────

  const handleSelectionChange = useCallback((ids: Set<number>) => {
    setSelectedTrackIds(ids);
  }, []);

  // ── Import complete (used by useLibraryImport) ────────────────

  const onImportComplete = useCallback(async () => {
    setHasLibrary(true);
    await fetchBrowserData();
    setDataLoaded(true);
  }, [fetchBrowserData]);

  // ── Album sort mode (persisted) ───────────────────────────────

  const handleAlbumSortModeChange = useCallback((mode: AlbumSortMode) => {
    setAlbumSortMode(mode);
    setSetting("albumSortMode", mode);
  }, []);

  return {
    // Data
    tracks,
    genreList,
    artistList,
    albumList,
    totalTrackCount,
    hasLibrary,
    dataLoaded,
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
    // Data operations
    onImportComplete,
    fetchBrowserData,
    loadMoreTracks,
  };
};
