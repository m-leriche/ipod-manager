import { useViewLayout } from "../../../contexts/ViewLayoutContext";

interface LibraryToolbarProps {
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  search: string;
  onSearchChange: (value: string) => void;
  flaggedOnly: boolean;
  onToggleFlaggedOnly: () => void;
  isBackgroundScanning: boolean;
  trackCount: number;
  displayedTrackCount: number;
  isPlaylistView: boolean;
}

export const LibraryToolbar = ({
  searchInputRef,
  search,
  onSearchChange,
  flaggedOnly,
  onToggleFlaggedOnly,
  isBackgroundScanning,
  trackCount,
  displayedTrackCount,
  isPlaylistView,
}: LibraryToolbarProps) => {
  const {
    showPlaylistSidebar,
    showColumnBrowser,
    showAlbumGrid,
    showArtworkCarousel,
    showTrackList,
    showLyricsPanel,
    lyricsOverlay,
    togglePlaylistSidebar,
    toggleColumnBrowser,
    toggleAlbumGrid,
    toggleArtworkCarousel,
    toggleTrackList,
    toggleLyricsPanel,
    toggleLyricsOverlay,
  } = useViewLayout();

  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-border shrink-0">
      <input
        ref={searchInputRef}
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search... (⌘F)"
        aria-label="Search library"
        className="w-48 px-3 py-1 bg-bg-card border border-border rounded-md text-[11px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-active"
      />
      <button
        onClick={onToggleFlaggedOnly}
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
      {isBackgroundScanning && (
        <span className="text-[10px] text-text-tertiary flex items-center gap-1.5 animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
          Updating…
        </span>
      )}
      <span className="text-[10px] text-text-tertiary tabular-nums">
        {isPlaylistView ? displayedTrackCount : trackCount} tracks
      </span>
      <div className="w-px h-4 bg-border" />
      <div className="flex items-center gap-0.5">
        <ViewToggle active={showPlaylistSidebar} onClick={togglePlaylistSidebar} title="Playlists">
          <path strokeLinecap="round" d="M4 6h16M4 10h12M4 14h14M4 18h10" />
        </ViewToggle>
        <ViewToggle active={showColumnBrowser && !showAlbumGrid} onClick={toggleColumnBrowser} title="Column browser">
          <rect x="3" y="3" width="5" height="18" rx="1" />
          <rect x="10" y="3" width="5" height="18" rx="1" />
          <rect x="17" y="3" width="5" height="18" rx="1" />
        </ViewToggle>
        <ViewToggle active={showAlbumGrid} onClick={toggleAlbumGrid} title="Album grid">
          <rect x="3" y="3" width="8" height="8" rx="1" />
          <rect x="13" y="3" width="8" height="8" rx="1" />
          <rect x="3" y="13" width="8" height="8" rx="1" />
          <rect x="13" y="13" width="8" height="8" rx="1" />
        </ViewToggle>
        <ViewToggle active={showArtworkCarousel} onClick={toggleArtworkCarousel} title="Cover flow">
          <path d="M2 8l4-1v10l-4-1V8z" />
          <rect x="8" y="4" width="8" height="16" rx="1" />
          <path d="M22 8l-4-1v10l4-1V8z" />
        </ViewToggle>
        {(showAlbumGrid || showArtworkCarousel) && (
          <ViewToggle active={showTrackList} onClick={toggleTrackList} title="Track list">
            <path strokeLinecap="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </ViewToggle>
        )}
        <LyricsToggle
          showLyricsPanel={showLyricsPanel}
          lyricsOverlay={lyricsOverlay}
          showArtworkCarousel={showArtworkCarousel}
          onToggleLyricsPanel={toggleLyricsPanel}
          onToggleLyricsOverlay={toggleLyricsOverlay}
        />
      </div>
    </div>
  );
};

// ── View Toggle Button ──────────────────────────────────────────

const ViewToggle = ({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className={`p-1.5 rounded transition-colors ${
      active ? "text-accent bg-accent/10" : "text-text-tertiary hover:text-text-secondary"
    }`}
    title={title}
    aria-label={title}
    aria-pressed={active}
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5">
      {children}
    </svg>
  </button>
);

// ── Lyrics Toggle (3-state in cover flow) ───────────────────────

const LyricsToggle = ({
  showLyricsPanel,
  lyricsOverlay,
  showArtworkCarousel,
  onToggleLyricsPanel,
  onToggleLyricsOverlay,
}: {
  showLyricsPanel: boolean;
  lyricsOverlay: boolean;
  showArtworkCarousel: boolean;
  onToggleLyricsPanel: () => void;
  onToggleLyricsOverlay?: () => void;
}) => {
  const inCoverFlow = showArtworkCarousel && !!onToggleLyricsOverlay;

  const handleClick = () => {
    if (!inCoverFlow) {
      onToggleLyricsPanel();
      return;
    }
    if (!showLyricsPanel) {
      onToggleLyricsPanel();
      onToggleLyricsOverlay!();
    } else if (lyricsOverlay) {
      onToggleLyricsOverlay!();
    } else {
      onToggleLyricsPanel();
    }
  };

  const isOverlay = showLyricsPanel && lyricsOverlay && inCoverFlow;
  const isSidebar = showLyricsPanel && !isOverlay;

  const title = isOverlay
    ? "Lyrics overlay (click for sidebar)"
    : isSidebar && inCoverFlow
      ? "Lyrics sidebar (click to turn off)"
      : "Lyrics";

  return (
    <button
      onClick={handleClick}
      className={`p-1.5 rounded transition-colors ${
        isOverlay
          ? "text-accent bg-accent/20 ring-1 ring-accent/40"
          : showLyricsPanel
            ? "text-accent bg-accent/10"
            : "text-text-tertiary hover:text-text-secondary"
      }`}
      title={title}
      aria-label={title}
      aria-pressed={showLyricsPanel}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5">
        {isOverlay ? (
          <>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path strokeLinecap="round" d="M7 10h10M7 14h6" />
          </>
        ) : (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V4.5l-10.5 3v7.553m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z"
          />
        )}
      </svg>
    </button>
  );
};
