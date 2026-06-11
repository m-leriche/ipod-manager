import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LibraryPlayer } from "./LibraryPlayer";

// Mock sub-components to isolate LibraryPlayer logic
vi.mock("../../organisms/AlbumGrid/AlbumGrid", () => ({
  AlbumGrid: () => <div data-testid="album-grid" />,
}));
vi.mock("../../organisms/ArtworkCarousel/ArtworkCarousel", () => ({
  ArtworkCarousel: () => <div data-testid="artwork-carousel" />,
}));
vi.mock("../../organisms/AlbumGrid/useResizableHeight", () => ({
  useResizableHeight: () => ({
    containerRef: { current: null },
    fraction: 0.4,
    onDragStart: vi.fn(),
  }),
}));
vi.mock("../../organisms/ColumnBrowser/ColumnBrowser", () => ({
  ColumnBrowser: () => <div data-testid="column-browser" />,
}));
vi.mock("../../organisms/TrackTable/TrackTable", () => ({
  TrackTable: () => <div data-testid="track-table" />,
}));
vi.mock("../../organisms/TrackDetailPanel/TrackDetailPanel", () => ({
  TrackDetailPanel: () => <div data-testid="detail-panel" />,
}));
vi.mock("../LibraryStats/LibraryStats", () => ({
  LibraryStats: () => <div data-testid="library-stats" />,
}));
vi.mock("./PlaylistSidebar", () => ({
  PlaylistSidebar: () => <div data-testid="playlist-sidebar" />,
}));
vi.mock("../../organisms/SmartPlaylistEditor/SmartPlaylistEditor", () => ({
  SmartPlaylistEditor: () => <div data-testid="smart-playlist-editor" />,
}));
vi.mock("./LibraryStatusBar", () => ({
  LibraryStatusBar: () => <div data-testid="status-bar" />,
}));
vi.mock("./LibraryToolbar", () => ({
  LibraryToolbar: () => <div data-testid="library-toolbar" />,
}));
vi.mock("../../atoms/Skeleton/Skeleton", () => ({
  LibraryLoadingSkeleton: () => <div data-testid="loading-skeleton" />,
}));

const mockStartArtRepair = vi.fn();
const mockStartLyricsFetch = vi.fn();

vi.mock("../../../contexts/BackgroundArtRepairContext", () => ({
  useBackgroundArtRepair: () => ({
    state: { active: false, total: 0, completed: 0, currentItem: "" },
    start: mockStartArtRepair,
    cancel: vi.fn(),
  }),
}));
vi.mock("../../../contexts/BackgroundLyricsContext", () => ({
  useBackgroundLyrics: () => ({
    state: { active: false, total: 0, completed: 0, currentItem: "" },
    start: mockStartLyricsFetch,
    cancel: vi.fn(),
  }),
}));

const mockViewLayout = {
  showColumnBrowser: false,
  showInfoPanel: false,
  showStatsPanel: false,
  showPlaylistSidebar: false,
  showAlbumGrid: false,
  showTrackList: true,
  showLyricsPanel: false,
  showArtworkCarousel: false,
  lyricsOverlay: false,
  toggleColumnBrowser: vi.fn(),
  toggleInfoPanel: vi.fn(),
  toggleStatsPanel: vi.fn(),
  togglePlaylistSidebar: vi.fn(),
  toggleAlbumGrid: vi.fn(),
  toggleTrackList: vi.fn(),
  toggleArtworkCarousel: vi.fn(),
  toggleLyricsPanel: vi.fn(),
  toggleLyricsOverlay: vi.fn(),
  dismissLyricsOverlay: vi.fn(),
};

vi.mock("../../../contexts/ViewLayoutContext", () => ({
  useViewLayout: () => mockViewLayout,
}));

// Mock the data/actions hooks
const mockLibraryData = {
  hasLibrary: true,
  dataLoaded: true,
  tracks: [],
  displayedTracks: [],
  totalTrackCount: 0,
  libraryPath: "/music",
  search: "",
  setSearch: vi.fn(),
  flaggedOnly: false,
  toggleFlaggedOnly: vi.fn(),
  isBackgroundScanning: false,
  sortBy: "artist",
  sortDirection: "asc" as const,
  handleSort: vi.fn(),
  handleSelectionChange: vi.fn(),
  selectedTracks: [],
  fetchBrowserData: vi.fn(),
  onImportComplete: vi.fn(),
  searchInputRef: { current: null },
  genreList: [],
  artistList: [],
  albumList: [],
  selectedGenres: new Set<string>(),
  selectedArtists: new Set<string>(),
  selectedAlbums: new Set<string>(),
  handleSelectGenre: vi.fn(),
  handleSelectArtist: vi.fn(),
  handleSelectAlbum: vi.fn(),
  handlePlayColumn: vi.fn(),
  albumSortMode: "alpha" as const,
  handleAlbumSortModeChange: vi.fn(),
  loadMoreTracks: vi.fn(),
};

vi.mock("./useLibraryData", () => ({
  useLibraryData: () => mockLibraryData,
}));

vi.mock("./useLibraryActions", () => ({
  useLibraryActions: () => ({
    handleColumnPlayAll: vi.fn(),
    handleColumnAddToQueue: vi.fn(),
    handleColumnAddToPlaylist: vi.fn(),
    handleFlagTracks: vi.fn(),
    handleRateTracks: vi.fn(),
    handleRepairAlbumArt: vi.fn(),
    handleFixAlbumArtForAlbum: vi.fn(),
    handleUploadAlbumArt: vi.fn(),
    handleFetchLyrics: vi.fn(),
    handleRemoveLyrics: vi.fn(),
  }),
}));

// Capture the import-complete callback LibraryPlayer hands to useLibraryImport
let capturedImportComplete: ((importedPaths?: string[]) => Promise<void>) | undefined;
vi.mock("./useLibraryImport", () => ({
  useLibraryImport: (...args: unknown[]) => {
    capturedImportComplete = args[5] as (importedPaths?: string[]) => Promise<void>;
    return {
      isDragOver: false,
      handleChooseLibrary: vi.fn(),
    };
  },
}));

describe("LibraryPlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockLibraryData.hasLibrary = true;
    mockLibraryData.dataLoaded = true;
    // Reset view layout to defaults
    Object.assign(mockViewLayout, {
      showColumnBrowser: false,
      showInfoPanel: false,
      showStatsPanel: false,
      showPlaylistSidebar: false,
      showAlbumGrid: false,
      showTrackList: true,
      showLyricsPanel: false,
      showArtworkCarousel: false,
      lyricsOverlay: false,
    });
  });

  it("renders empty state when no library exists", () => {
    mockLibraryData.hasLibrary = false;
    render(<LibraryPlayer />);
    expect(screen.getByText("Add your music library")).toBeInTheDocument();
    expect(screen.getByText("Choose Folder")).toBeInTheDocument();
  });

  it("renders loading skeleton when data is not loaded", () => {
    mockLibraryData.dataLoaded = false;
    render(<LibraryPlayer />);
    expect(screen.getByTestId("loading-skeleton")).toBeInTheDocument();
  });

  it("renders toolbar and track table when library is loaded", () => {
    render(<LibraryPlayer />);
    expect(screen.getByTestId("library-toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("track-table")).toBeInTheDocument();
    expect(screen.getByTestId("status-bar")).toBeInTheDocument();
  });

  it("shows column browser when showColumnBrowser is true", () => {
    mockViewLayout.showColumnBrowser = true;
    render(<LibraryPlayer />);
    expect(screen.getByTestId("column-browser")).toBeInTheDocument();
  });

  it("shows album grid when showAlbumGrid is true", () => {
    mockViewLayout.showAlbumGrid = true;
    render(<LibraryPlayer />);
    expect(screen.getByTestId("album-grid")).toBeInTheDocument();
  });

  it("shows artwork carousel when showArtworkCarousel is true", () => {
    mockViewLayout.showArtworkCarousel = true;
    render(<LibraryPlayer />);
    expect(screen.getByTestId("artwork-carousel")).toBeInTheDocument();
  });

  it("shows playlist sidebar when showPlaylistSidebar is true", () => {
    mockViewLayout.showPlaylistSidebar = true;
    render(<LibraryPlayer />);
    expect(screen.getByTestId("playlist-sidebar")).toBeInTheDocument();
  });

  it("shows info panel when showInfoPanel is true", () => {
    mockViewLayout.showInfoPanel = true;
    render(<LibraryPlayer />);
    expect(screen.getByTestId("detail-panel")).toBeInTheDocument();
  });

  it("shows stats panel when showStatsPanel is true", () => {
    mockViewLayout.showStatsPanel = true;
    render(<LibraryPlayer />);
    expect(screen.getByTestId("library-stats")).toBeInTheDocument();
  });

  it("does not show column browser by default", () => {
    render(<LibraryPlayer />);
    expect(screen.queryByTestId("column-browser")).not.toBeInTheDocument();
  });

  describe("import complete", () => {
    it("refreshes data and starts auto-fetches enabled in settings", async () => {
      localStorage.setItem("crate-auto-fetch-album-art", "true");
      localStorage.setItem("crate-auto-fetch-lyrics", "true");
      render(<LibraryPlayer />);

      await capturedImportComplete!();

      expect(mockLibraryData.onImportComplete).toHaveBeenCalledTimes(1);
      expect(mockStartArtRepair).toHaveBeenCalledTimes(1);
      expect(mockStartLyricsFetch).toHaveBeenCalledTimes(1);
    });

    it("scopes auto-fetches to the newly imported files", async () => {
      localStorage.setItem("crate-auto-fetch-album-art", "true");
      localStorage.setItem("crate-auto-fetch-lyrics", "true");
      render(<LibraryPlayer />);

      const imported = ["/music/Artist/Album/01-01 Song.flac"];
      await capturedImportComplete!(imported);

      expect(mockStartArtRepair).toHaveBeenCalledWith(imported);
      expect(mockStartLyricsFetch).toHaveBeenCalledWith(imported);
    });

    it("skips auto-fetches when nothing was imported", async () => {
      localStorage.setItem("crate-auto-fetch-album-art", "true");
      localStorage.setItem("crate-auto-fetch-lyrics", "true");
      render(<LibraryPlayer />);

      await capturedImportComplete!([]);

      expect(mockLibraryData.onImportComplete).toHaveBeenCalledTimes(1);
      expect(mockStartArtRepair).not.toHaveBeenCalled();
      expect(mockStartLyricsFetch).not.toHaveBeenCalled();
    });

    it("does not start auto-fetches when disabled in settings", async () => {
      render(<LibraryPlayer />);

      await capturedImportComplete!();

      expect(mockLibraryData.onImportComplete).toHaveBeenCalledTimes(1);
      expect(mockStartArtRepair).not.toHaveBeenCalled();
      expect(mockStartLyricsFetch).not.toHaveBeenCalled();
    });
  });
});
