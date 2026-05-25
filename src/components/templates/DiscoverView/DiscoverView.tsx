import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNewReleases } from "../../../contexts/NewReleasesContext";
import { useToast } from "../../../contexts/ToastContext";
import { DiscoverCard } from "./DiscoverCard";
import type { DiscoverSection, DiscoverAlbum, SeedStrategy } from "./types";

const STRATEGY_LABELS: Record<SeedStrategy, string> = {
  random: "Random",
  most_played: "Most Played",
  recently_played: "Recently Played",
  recently_added: "Recently Added",
};

export const DiscoverView = () => {
  const [sections, setSections] = useState<DiscoverSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<SeedStrategy>("random");

  const [searchResults, setSearchResults] = useState<DiscoverSection[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Refs for dismiss handler to avoid stale closures on rapid clicks
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const searchResultsRef = useRef(searchResults);
  searchResultsRef.current = searchResults;

  const [genres, setGenres] = useState<string[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [tagAlbums, setTagAlbums] = useState<DiscoverAlbum[]>([]);
  const [tagLoading, setTagLoading] = useState(false);

  const { watchArtist } = useNewReleases();
  const toast = useToast();

  // ── Snapshot persistence helper ──────────────────────────────

  const saveSnapshot = useCallback((updated: DiscoverSection[]) => {
    invoke("save_discover_snapshot", { sections: updated }).catch(() => {});
  }, []);

  // ── Feed loading ─────────────────────────────────────────────

  const loadFeed = useCallback(
    async (refresh = false, strat?: SeedStrategy) => {
      setLoading(true);
      setError(null);
      const s = strat ?? strategy;
      try {
        const cmd = refresh ? "refresh_discover_feed" : "get_discover_feed";
        const data = await invoke<DiscoverSection[]>(cmd, { strategy: s });
        setSections(data);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [strategy],
  );

  const loadGenres = useCallback(async () => {
    try {
      const data = await invoke<{ name: string; track_count: number }[]>("get_library_genres");
      setGenres(data.slice(0, 20).map((g) => g.name));
    } catch {
      // Genres are optional — fail silently
    }
  }, []);

  useEffect(() => {
    loadFeed();
    loadGenres();
  }, [loadFeed, loadGenres]);

  const handleStrategyChange = useCallback(
    (s: SeedStrategy) => {
      setStrategy(s);
      loadFeed(true, s);
    },
    [loadFeed],
  );

  // ── Search ───────────────────────────────────────────────────

  const handleSearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;
      setSearchLoading(true);
      try {
        const section = await invoke<DiscoverSection>("search_discover", { query: trimmed });
        if (section.albums.length > 0) {
          setSearchResults((prev) => {
            const existing = prev.findIndex((s) => s.seed_artist.toLowerCase() === section.seed_artist.toLowerCase());
            if (existing >= 0) {
              const next = [...prev];
              next[existing] = section;
              return next;
            }
            return [section, ...prev];
          });
        }
      } catch {
        toast.error(`No recommendations found for "${trimmed}"`);
      } finally {
        setSearchLoading(false);
        setSearchQuery("");
      }
    },
    [toast],
  );

  const handleSearchSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      handleSearch(searchQuery);
    },
    [searchQuery, handleSearch],
  );

  const clearSearchResult = useCallback((seedArtist: string) => {
    setSearchResults((prev) => prev.filter((s) => s.seed_artist !== seedArtist));
  }, []);

  // ── Dismiss & replace a single album ─────────────────────────

  const handleDismissAlbum = useCallback(
    async (sectionIdx: number, albumIdx: number, source: "feed" | "search") => {
      // Read from refs to avoid stale closures on rapid dismissals
      const list = source === "feed" ? sectionsRef.current : searchResultsRef.current;
      const section = list[sectionIdx];
      if (!section || !section.albums[albumIdx]) return;

      const seedArtist = section.seed_artist;
      const excludeArtists = section.albums.map((a) => a.artist_name);

      const applyUpdate = (setter: typeof setSections, replacement: DiscoverAlbum | null, persist: boolean) => {
        setter((prev) => {
          const next = prev.map((s, si) => {
            if (si !== sectionIdx) return s;
            const albums = [...s.albums];
            if (replacement) {
              albums[albumIdx] = replacement;
            } else {
              albums.splice(albumIdx, 1);
            }
            return { ...s, albums };
          });
          if (persist) saveSnapshot(next);
          return next;
        });
      };

      const setter = source === "feed" ? setSections : setSearchResults;
      const persist = source === "feed";

      try {
        const replacement = await invoke<DiscoverAlbum | null>("replace_discover_album", {
          seedArtist,
          excludeArtists,
        });
        applyUpdate(setter, replacement, persist);
      } catch {
        applyUpdate(setter, null, persist);
      }
    },
    [saveSnapshot],
  );

  // ── Tags ─────────────────────────────────────────────────────

  const handleTagClick = useCallback(
    async (tag: string) => {
      if (tag === activeTag) {
        setActiveTag(null);
        setTagAlbums([]);
        return;
      }
      setActiveTag(tag);
      setTagLoading(true);
      try {
        const data = await invoke<DiscoverAlbum[]>("get_discover_tag_albums", { tag, limit: 20 });
        setTagAlbums(data);
      } catch {
        setTagAlbums([]);
      } finally {
        setTagLoading(false);
      }
    },
    [activeTag],
  );

  const handleWatchArtist = useCallback(
    (name: string) => {
      watchArtist(name).catch(() => {});
    },
    [watchArtist],
  );

  const isEmpty = !loading && sections.length === 0 && searchResults.length === 0 && !error;

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-8 py-6">
        {/* Controls */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <select
              value={strategy}
              onChange={(e) => handleStrategyChange(e.target.value as SeedStrategy)}
              className="text-[10px] bg-bg-card border border-border rounded-md px-2 py-1 text-text-secondary focus:outline-none focus:border-border-active"
            >
              {(Object.entries(STRATEGY_LABELS) as [SeedStrategy, string][]).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => loadFeed(true)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-40"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
              />
            </svg>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearchSubmit} className="mb-8">
          <div className="relative">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary pointer-events-none"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search an artist or album for recommendations..."
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-card border border-border text-xs text-text-primary placeholder:text-text-tertiary/60 focus:outline-none focus:border-border-active transition-colors"
            />
            {searchLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="w-3.5 h-3.5 text-text-tertiary animate-spin"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
                  />
                </svg>
              </div>
            )}
          </div>
        </form>

        {/* Error state */}
        {error && (
          <div className="text-xs text-text-tertiary text-center py-12">
            <p>Failed to load recommendations.</p>
            <button onClick={() => loadFeed()} className="mt-2 text-accent hover:text-accent-hover transition-colors">
              Try again
            </button>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className="text-center py-16">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1}
              className="w-10 h-10 text-text-tertiary/30 mx-auto mb-3"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"
              />
            </svg>
            <p className="text-xs text-text-tertiary">Add music to your library to get recommendations.</p>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && sections.length === 0 && searchResults.length === 0 && <SkeletonFeed />}

        {/* Search results */}
        {searchResults.map((section, si) => (
          <SectionRow
            key={`search-${section.seed_artist}`}
            section={section}
            onWatchArtist={handleWatchArtist}
            onDismissAlbum={(albumIdx) => handleDismissAlbum(si, albumIdx, "search")}
            onDismissSection={() => clearSearchResult(section.seed_artist)}
          />
        ))}

        {/* Feed sections */}
        {sections.map((section, si) => (
          <SectionRow
            key={section.seed_artist}
            section={section}
            onWatchArtist={handleWatchArtist}
            onDismissAlbum={(albumIdx) => handleDismissAlbum(si, albumIdx, "feed")}
          />
        ))}

        {/* Genre exploration */}
        {genres.length > 0 && (
          <div className="mt-10">
            <h3 className="text-xs font-medium text-text-secondary mb-3">Explore by Genre</h3>
            <div className="flex flex-wrap gap-1.5">
              {genres.map((genre) => (
                <button
                  key={genre}
                  onClick={() => handleTagClick(genre)}
                  className={`px-3 py-1 rounded-full text-[10px] font-medium transition-all border ${
                    activeTag === genre
                      ? "bg-accent/15 text-accent border-accent/30"
                      : "text-text-tertiary border-border hover:text-text-secondary hover:border-border-active"
                  }`}
                >
                  {genre}
                </button>
              ))}
            </div>

            {activeTag && (
              <div className="mt-4">
                {tagLoading ? (
                  <SkeletonGrid />
                ) : tagAlbums.length > 0 ? (
                  <AlbumGrid albums={tagAlbums} onWatchArtist={handleWatchArtist} />
                ) : (
                  <p className="text-[10px] text-text-tertiary py-4">No results for &ldquo;{activeTag}&rdquo;.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Attribution */}
        {(sections.length > 0 || tagAlbums.length > 0 || searchResults.length > 0) && (
          <div className="mt-10 mb-4 text-[9px] text-text-tertiary/40">Powered by Last.fm</div>
        )}
      </div>
    </div>
  );
};

// ── Album grid (tag exploration — no dismiss) ───────────────────

const AlbumGrid = ({ albums, onWatchArtist }: { albums: DiscoverAlbum[]; onWatchArtist: (name: string) => void }) => (
  <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-1">
    {albums.map((album, i) => (
      <DiscoverCard key={`${album.artist_name}-${album.name}-${i}`} album={album} onWatchArtist={onWatchArtist} />
    ))}
  </div>
);

// ── Section row ─────────────────────────────────────────────────

const SectionRow = ({
  section,
  onWatchArtist,
  onDismissAlbum,
  onDismissSection,
}: {
  section: DiscoverSection;
  onWatchArtist: (name: string) => void;
  onDismissAlbum?: (albumIdx: number) => void;
  onDismissSection?: () => void;
}) => (
  <div className="mb-8">
    <div className="flex items-center gap-2 mb-3">
      <h3 className="text-[11px] text-text-tertiary">
        Because you listen to <span className="text-text-secondary font-medium">{section.seed_artist}</span>
      </h3>
      {onDismissSection && (
        <button
          onClick={onDismissSection}
          className="text-text-tertiary/40 hover:text-text-tertiary transition-colors"
          title="Dismiss"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
    <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-1">
      {section.albums.map((album, i) => (
        <DiscoverCard
          key={`${album.artist_name}-${album.name}-${i}`}
          album={album}
          onWatchArtist={onWatchArtist}
          onDismiss={onDismissAlbum ? () => onDismissAlbum(i) : undefined}
        />
      ))}
    </div>
  </div>
);

// ── Skeleton loaders ────────────────────────────────────────────

const SkeletonCard = () => (
  <div className="p-2">
    <div className="w-full aspect-square rounded-lg bg-bg-elevated animate-pulse" />
    <div className="mt-2 space-y-1.5 px-0.5">
      <div className="h-3 w-4/5 rounded bg-bg-elevated animate-pulse" />
      <div className="h-2.5 w-3/5 rounded bg-bg-elevated animate-pulse" />
    </div>
  </div>
);

const SkeletonRow = () => (
  <div className="mb-8">
    <div className="h-3 w-48 rounded bg-bg-elevated animate-pulse mb-3" />
    <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  </div>
);

const SkeletonFeed = () => (
  <div data-testid="skeleton-feed">
    {Array.from({ length: 3 }).map((_, i) => (
      <SkeletonRow key={i} />
    ))}
  </div>
);

const SkeletonGrid = () => (
  <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-1" data-testid="skeleton-grid">
    {Array.from({ length: 8 }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
);
