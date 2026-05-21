import { useState } from "react";
import { ErrorBoundary } from "../../atoms/ErrorBoundary/ErrorBoundary";
import { AlbumGrid } from "../../organisms/AlbumGrid/AlbumGrid";
import { ArtworkCarousel } from "../../organisms/ArtworkCarousel/ArtworkCarousel";
import { useResizableHeight } from "../../organisms/AlbumGrid/useResizableHeight";
import { ColumnBrowser } from "../../organisms/ColumnBrowser/ColumnBrowser";
import { TrackTable } from "../../organisms/TrackTable/TrackTable";
import { TrackDetailPanel } from "../../organisms/TrackDetailPanel/TrackDetailPanel";
import { LibraryStats } from "../LibraryStats/LibraryStats";
import { PlaylistSidebar } from "./PlaylistSidebar";
import { SmartPlaylistEditor } from "../../organisms/SmartPlaylistEditor/SmartPlaylistEditor";
import { LibraryStatusBar } from "./LibraryStatusBar";
import { LibraryToolbar } from "./LibraryToolbar";
import { useProgress } from "../../../contexts/ProgressContext";
import { usePlayback } from "../../../contexts/PlaybackContext";
import { useBackgroundArtRepair } from "../../../contexts/BackgroundArtRepairContext";
import { useBackgroundLyrics } from "../../../contexts/BackgroundLyricsContext";
import { usePlaylist } from "../../../contexts/PlaylistContext";
import { useToast } from "../../../contexts/ToastContext";
import { useLibraryImport } from "./useLibraryImport";
import { useLibraryData } from "./useLibraryData";
import { useLibraryActions } from "./useLibraryActions";
import type { LibraryTrack, SmartPlaylist } from "../../../types/library";
import { LibraryLoadingSkeleton } from "../../atoms/Skeleton/Skeleton";

export const LibraryPlayer = ({
  onRefreshRef,
  isActive = true,
  onRepairMetadata,
  showColumnBrowser,
  showInfoPanel,
  showStatsPanel,
  showPlaylistSidebar,
  showAlbumGrid = false,
  showTrackList = true,
  showArtworkCarousel = false,
  showLyricsPanel = false,
  lyricsOverlay = false,
  onLyricsOverlayDismiss,
  onToggleColumnBrowser,
  onTogglePlaylistSidebar,
  onToggleAlbumGrid,
  onToggleArtworkCarousel,
  onToggleTrackList,
  onToggleLyricsPanel,
  onToggleLyricsOverlay,
  showFullscreenVisualizer = false,
  onToggleFullscreenVisualizer,
}: {
  onRefreshRef?: React.MutableRefObject<(() => void) | null>;
  isActive?: boolean;
  onRepairMetadata?: (tracks: LibraryTrack[]) => void;
  showColumnBrowser: boolean;
  showInfoPanel: boolean;
  showStatsPanel: boolean;
  showPlaylistSidebar: boolean;
  showAlbumGrid?: boolean;
  showTrackList?: boolean;
  showArtworkCarousel?: boolean;
  showLyricsPanel?: boolean;
  lyricsOverlay?: boolean;
  onLyricsOverlayDismiss?: () => void;
  onToggleColumnBrowser?: () => void;
  onTogglePlaylistSidebar?: () => void;
  onToggleAlbumGrid?: () => void;
  onToggleArtworkCarousel?: () => void;
  onToggleTrackList?: () => void;
  onToggleLyricsPanel?: () => void;
  onToggleLyricsOverlay?: () => void;
  showFullscreenVisualizer?: boolean;
  onToggleFullscreenVisualizer?: () => void;
}) => {
  const { start: startProgress, update: updateProgress, finish: finishProgress, fail: failProgress } = useProgress();
  const toast = useToast();
  const { state: artRepairState, start: startArtRepair } = useBackgroundArtRepair();
  const { state: lyricsState, start: startLyricsFetch } = useBackgroundLyrics();
  const gridResize = useResizableHeight();
  const carouselResize = useResizableHeight({
    storageKey: "crate-carousel-height",
    defaultFraction: 0.55,
    minFraction: 0.3,
    maxFraction: 0.75,
  });
  const browserResize = useResizableHeight({
    storageKey: "crate-browser-height",
    defaultFraction: 0.35,
    minFraction: 0.15,
    maxFraction: 0.6,
  });
  const {
    state: { libraryAvailable },
  } = usePlayback();
  const {
    playlists,
    activePlaylistId,
    setActivePlaylist,
    activeSmartPlaylistId,
    createSmartPlaylist,
    updateSmartPlaylist,
  } = usePlaylist();

  const [smartPlaylistEditing, setSmartPlaylistEditing] = useState<SmartPlaylist | null>(null);
  const [smartPlaylistCreating, setSmartPlaylistCreating] = useState(false);

  // ── Data management ───────────────────────────────────────────

  const data = useLibraryData(onRefreshRef);

  // ── Action handlers ───────────────────────────────────────────

  const actions = useLibraryActions(data.fetchBrowserData, data.tracks);

  // ── Import / drag-and-drop ─────────────────────────────────────

  const { isDragOver, handleChooseLibrary } = useLibraryImport(
    isActive,
    startProgress,
    updateProgress,
    finishProgress,
    failProgress,
    data.onImportComplete,
  );

  // ── Render ────────────────────────────────────────────────────

  if (data.hasLibrary === false) {
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

  if (!data.dataLoaded) {
    return <LibraryLoadingSkeleton />;
  }

  const isPlaylistView = activePlaylistId !== null || activeSmartPlaylistId !== null;

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
        <ErrorBoundary name="Playlists" compact>
          <PlaylistSidebar
            onPlaylistSelect={(id) => setActivePlaylist(id)}
            activePlaylistId={activePlaylistId}
            onSmartPlaylistEdit={(sp) => setSmartPlaylistEditing(sp)}
            onSmartPlaylistCreate={() => setSmartPlaylistCreating(true)}
          />
        </ErrorBoundary>
      )}
      <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-bg-primary">
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

        {/* Search bar + view toggles */}
        <LibraryToolbar
          searchInputRef={data.searchInputRef}
          search={data.search}
          onSearchChange={data.setSearch}
          flaggedOnly={data.flaggedOnly}
          onToggleFlaggedOnly={data.toggleFlaggedOnly}
          isBackgroundScanning={data.isBackgroundScanning}
          trackCount={data.totalTrackCount}
          displayedTrackCount={data.displayedTracks.length}
          isPlaylistView={isPlaylistView}
          showPlaylistSidebar={showPlaylistSidebar}
          showColumnBrowser={showColumnBrowser}
          showAlbumGrid={showAlbumGrid}
          showArtworkCarousel={showArtworkCarousel}
          showTrackList={showTrackList}
          showLyricsPanel={showLyricsPanel}
          lyricsOverlay={lyricsOverlay}
          onTogglePlaylistSidebar={onTogglePlaylistSidebar}
          onToggleColumnBrowser={onToggleColumnBrowser}
          onToggleAlbumGrid={onToggleAlbumGrid}
          onToggleArtworkCarousel={onToggleArtworkCarousel}
          onToggleTrackList={onToggleTrackList}
          onToggleLyricsPanel={onToggleLyricsPanel}
          onToggleLyricsOverlay={onToggleLyricsOverlay}
          showFullscreenVisualizer={showFullscreenVisualizer}
          onToggleFullscreenVisualizer={onToggleFullscreenVisualizer}
        />

        {/* Column browser / album grid / carousel (hidden in playlist view) */}
        {!isPlaylistView && (
          <>
            {showArtworkCarousel ? (
              <>
                <div
                  ref={carouselResize.containerRef}
                  style={showTrackList ? { height: `${carouselResize.fraction * 100}%` } : undefined}
                  className={`${showTrackList ? "shrink-0 min-h-0" : "flex-1 min-h-0"} view-enter`}
                >
                  <ErrorBoundary name="Artwork Carousel">
                    <ArtworkCarousel
                      albums={data.albumList}
                      selectedAlbum={data.selectedAlbums.size === 1 ? [...data.selectedAlbums][0] : null}
                      onSelectAlbum={(name) => data.handleSelectAlbum(name ? new Set([name]) : new Set())}
                      onPlayAlbum={(name) => actions.handleColumnPlayAll({ column: "album", value: name })}
                      sortMode={data.albumSortMode}
                      onSortModeChange={data.handleAlbumSortModeChange}
                      artists={data.artistList}
                      selectedArtist={data.selectedArtists.size === 1 ? [...data.selectedArtists][0] : null}
                      onSelectArtist={(name) => data.handleSelectArtist(name ? new Set([name]) : new Set())}
                      lyricsOverlay={lyricsOverlay}
                      onLyricsOverlayDismiss={onLyricsOverlayDismiss}
                    />
                  </ErrorBoundary>
                </div>
                {showTrackList && <ResizeHandle onMouseDown={carouselResize.onDragStart} />}
              </>
            ) : showAlbumGrid ? (
              <>
                <div
                  ref={gridResize.containerRef}
                  style={showTrackList ? { height: `${gridResize.fraction * 100}%` } : undefined}
                  className={`${showTrackList ? "shrink-0 min-h-0" : "flex-1 min-h-0"} view-enter`}
                >
                  <ErrorBoundary name="Album Grid">
                    <AlbumGrid
                      albums={data.albumList}
                      selectedAlbum={data.selectedAlbums.size === 1 ? [...data.selectedAlbums][0] : null}
                      onSelectAlbum={(name) => data.handleSelectAlbum(name ? new Set([name]) : new Set())}
                      onPlayAlbum={(name) => actions.handleColumnPlayAll({ column: "album", value: name })}
                      onFixAlbumArt={actions.handleFixAlbumArtForAlbum}
                      onUploadAlbumArt={actions.handleUploadAlbumArt}
                      onFixAllAlbumArt={startArtRepair}
                      isFixingAllArt={artRepairState.active}
                      sortMode={data.albumSortMode}
                      onSortModeChange={data.handleAlbumSortModeChange}
                    />
                  </ErrorBoundary>
                </div>
                {showTrackList && <ResizeHandle onMouseDown={gridResize.onDragStart} />}
              </>
            ) : (
              showColumnBrowser && (
                <>
                  <div
                    ref={browserResize.containerRef}
                    style={{ height: `${browserResize.fraction * 100}%` }}
                    className="shrink-0 min-h-0 view-enter bg-bg-primary"
                  >
                    <ErrorBoundary name="Column Browser">
                      <ColumnBrowser
                        genres={data.genreList}
                        artists={data.artistList}
                        albums={data.albumList}
                        selectedGenres={data.selectedGenres}
                        selectedArtists={data.selectedArtists}
                        selectedAlbums={data.selectedAlbums}
                        onSelectGenres={data.handleSelectGenre}
                        onSelectArtists={data.handleSelectArtist}
                        onSelectAlbums={data.handleSelectAlbum}
                        onPlay={data.handlePlayColumn}
                        onPlayAll={actions.handleColumnPlayAll}
                        onAddAllToQueue={actions.handleColumnAddToQueue}
                        onAddAllToPlaylist={actions.handleColumnAddToPlaylist}
                        playlists={playlists}
                      />
                    </ErrorBoundary>
                  </div>
                  <ResizeHandle
                    onMouseDown={browserResize.onDragStart}
                    style={{ background: "var(--color-bg-primary)" }}
                  />
                </>
              )
            )}
          </>
        )}

        {/* Track table */}
        {(!(showAlbumGrid || showArtworkCarousel) || showTrackList) && (
          <ErrorBoundary name="Track Table">
            <TrackTable
              tracks={data.displayedTracks}
              totalTrackCount={!isPlaylistView ? data.totalTrackCount : undefined}
              onLoadMore={!isPlaylistView ? data.loadMoreTracks : undefined}
              sortBy={data.sortBy}
              sortDirection={data.sortDirection}
              onSort={data.handleSort}
              onSelectionChange={data.handleSelectionChange}
              onTracksDeleted={data.fetchBrowserData}
              onFlagTracks={actions.handleFlagTracks}
              onRateTracks={actions.handleRateTracks}
              onRepairAlbumArt={actions.handleRepairAlbumArt}
              onRepairAllAlbumArt={startArtRepair}
              isRepairingAllArt={artRepairState.active}
              onFetchLyrics={actions.handleFetchLyrics}
              onRemoveLyrics={actions.handleRemoveLyrics}
              onFetchAllLyrics={startLyricsFetch}
              isFetchingAllLyrics={lyricsState.active}
              onRepairMetadata={onRepairMetadata}
              activePlaylistId={activePlaylistId}
            />
          </ErrorBoundary>
        )}

        <ErrorBoundary name="Status Bar" compact>
          <LibraryStatusBar
            selectedTracks={data.selectedTracks}
            hideSelectionStats={showAlbumGrid || showArtworkCarousel}
          />
        </ErrorBoundary>
      </div>

      {showInfoPanel && (
        <ErrorBoundary name="Track Detail" compact>
          <TrackDetailPanel tracks={data.selectedTracks} onSave={data.fetchBrowserData} />
        </ErrorBoundary>
      )}
      {showStatsPanel && (
        <div className="w-[320px] shrink-0 border-l border-border bg-bg-secondary flex flex-col overflow-hidden panel-slide-right">
          <ErrorBoundary name="Library Stats" compact>
            <LibraryStats libraryPath={data.libraryPath} />
          </ErrorBoundary>
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
              toast.error(`Failed to save smart playlist: ${e}`);
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

const ResizeHandle = ({
  onMouseDown,
  style,
}: {
  onMouseDown: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}) => (
  <div
    onMouseDown={onMouseDown}
    className="shrink-0 h-1.5 cursor-row-resize flex items-center justify-center group hover:bg-accent/10 rounded-full transition-colors"
    style={style}
  >
    <div className="w-8 h-0.5 rounded-full bg-border group-hover:bg-accent/50 transition-colors" />
  </div>
);
